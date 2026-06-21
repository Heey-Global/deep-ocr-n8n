"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepOcr = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const errors_1 = require("../../utils/errors");
// Single source of truth for the published version — keeps the client
// identifier strings in lockstep with semantic-release bumps without a
// hardcoded version literal anywhere.
const package_json_1 = require("../../../package.json");
/** Deep-OCR API base URL */
const API_BASE = 'https://api.deep-ocr.com';
/** POST a new extraction job */
const EXTRACTIONS_URL = `${API_BASE}/v1/extractions`;
/**
 * GET the status of a single extraction by id (contract format: `ext_<uuid>`).
 * `encodeURIComponent` escapes the id as a single path segment so the call
 * still works if a future id format ever contains a `/` — though the
 * `ext_<uuid>` form documented in EXTRACTIONS_API_CONTRACT has no reserved
 * characters and round-trips unchanged.
 */
const extractionUrl = (jobId) => `${API_BASE}/v1/extractions/${encodeURIComponent(jobId)}`;
/**
 * Tightened object check that rejects null AND arrays. Plain `typeof x === 'object'`
 * accepts both — an `[]` poll body would otherwise sail past the shape check, have
 * `polled.status === undefined`, and only fail via the 5-min timeout instead of
 * surfacing the malformed response immediately.
 */
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/**
 * Pure parser for the `Retry-After` header (seconds, per the contract).
 * Returns the parsed value in milliseconds, or undefined when:
 *   - the header is absent
 *   - the value is not a finite positive number
 *   - the value is an HTTP-date string (intentionally not supported;
 *     the contract documents seconds-only)
 * Header lookup checks the lowercased key first (n8n normalises) with the
 * canonical-case key as a mock-friendly fallback.
 */
const parseRetryAfterMs = (headers) => {
    if (!isPlainObject(headers))
        return undefined;
    const raw = headers['retry-after'] ?? headers['Retry-After'];
    if (typeof raw !== 'string' && typeof raw !== 'number')
        return undefined;
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0)
        return undefined;
    return Math.floor(seconds * 1000);
};
/** Poll cadence: start short, grow gently, cap, give up after a sane bound. */
const POLL_INITIAL_MS = 1_000;
const POLL_MAX_MS = 5_000;
const POLL_BACKOFF = 1.5;
const POLL_TIMEOUT_MS = 5 * 60_000; // 5 minutes total wall-clock
/**
 * Hard upper bound on a server-provided Retry-After (in ms). Protects against
 * a buggy or pathological header value that would otherwise stall the workflow
 * past POLL_TIMEOUT_MS in a single sleep.
 */
const RETRY_AFTER_MAX_MS = 30_000;
/**
 * Client identifier the API logs and attributes traffic by.
 * Format pinned with deep-ocr-api: `deep-ocr-n8n/<semver>` (e.g.
 * `deep-ocr-n8n/1.9.0`). Sent on EVERY outbound API call as:
 *   - `User-Agent` header (web-standard; surfaces in request_logs.user_agent)
 *   - `X-Deep-OCR-Client` header (canonical, custom — defence in depth in
 *     case a future n8n version resets the UA)
 * The API parser uses X-Deep-OCR-Client as the authoritative source, with
 * User-Agent as the fallback for callers that can't set custom headers.
 *
 * Frozen + spread-at-call-site (two-layer defence). n8n-core's auth pipeline
 * is implemented outside this repo and historically merges the credential's
 * Authorization header into requestOptions.headers via Object.assign in some
 * code paths. If CLIENT_HEADERS were passed by reference into that pipeline,
 * an Authorization header could accumulate on the shared module-level
 * constant — leaking across executions and credentials. Two layers:
 *   1. Object.freeze — any direct mutation throws under strict mode rather
 *      than silently polluting the constant.
 *   2. The call site uses `headers: { ...CLIENT_HEADERS }` — n8n's pipeline
 *      mutates the per-call copy, not the canonical source.
 *
 * The constant is applied to BOTH async call sites — the POST submit AND
 * every GET poll — so every wire byte the node sends to deep-ocr-api
 * carries the attribution.
 */
const CLIENT_ID = `deep-ocr-n8n/${package_json_1.version}`;
const CLIENT_HEADERS = Object.freeze({
    'User-Agent': CLIENT_ID,
    'X-Deep-OCR-Client': CLIENT_ID,
});
// Mirrors the closed 12-value DocumentType enum from the API contract — every
// value (including `auto` and `fulltext`) is sent verbatim as the
// `document_type` form field; the field is required at submit. The validator
// below runs on the UI value to guard against crafted workflow JSON.
const ALLOWED_DOCUMENT_TYPES = [
    'auto',
    'bank_statement',
    'contract',
    'delivery_note',
    'fulltext',
    'generic',
    'handwriting',
    'id_document',
    'invoice',
    'payslip',
    'purchase_order',
    'receipt',
];
/**
 * Deep-OCR Node
 *
 * AI-powered OCR for invoices, receipts, contracts, IDs, bank statements
 * and more — returns structured JSON ready to use.
 * Supports PDF, PNG, JPG, JPEG, WebP, and TIFF formats up to 100MB.
 */
class DeepOcr {
    description = {
        displayName: 'Deep-OCR',
        name: 'deepOcr',
        icon: 'file:deepocr.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["documentType"]}}',
        description: 'AI-powered OCR for invoices, receipts, contracts, IDs, bank statements and more — returns structured JSON ready to use',
        defaults: {
            name: 'Deep-OCR',
        },
        inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
        outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
        usableAsTool: true,
        credentials: [
            {
                name: 'deepOcrApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Binary Property',
                name: 'binaryPropertyName',
                type: 'string',
                default: 'data',
                required: true,
                description: 'Name of the binary property containing the document to process',
                placeholder: "e.g. 'data', 'file', 'document'",
            },
            {
                displayName: 'Document Type',
                name: 'documentType',
                type: 'options',
                options: [
                    {
                        name: 'Auto-Detect',
                        value: 'auto',
                        description: 'Let the API classify the document first and then extract — costs more than picking a specific type. Use only when the document type is genuinely unknown.',
                    },
                    {
                        name: 'Bank Statement',
                        value: 'bank_statement',
                        description: 'Extract account info, balances, and transaction list from bank statements',
                    },
                    {
                        name: 'Contract',
                        value: 'contract',
                        description: 'Extract parties, terms, and obligations from contracts',
                    },
                    {
                        name: 'Delivery Note',
                        value: 'delivery_note',
                        description: 'Extract sender, recipient, items, quantities, and tracking info',
                    },
                    {
                        name: 'Full-Text',
                        value: 'fulltext',
                        description: 'Transcribe the entire document as Markdown — billed at 10× a structured extraction',
                    },
                    {
                        name: 'Generic',
                        value: 'generic',
                        description: 'Flexible extraction for any document — use when no specific type fits',
                    },
                    {
                        name: 'Handwriting',
                        value: 'handwriting',
                        description: 'Transcribe handwritten text with confidence rating',
                    },
                    {
                        name: 'ID Document',
                        value: 'id_document',
                        description: 'Extract personal data from passports, ID cards, and driving licences',
                    },
                    {
                        name: 'Invoice',
                        value: 'invoice',
                        description: 'Extract vendor, line items, tax breakdown, totals, and payment terms',
                    },
                    {
                        name: 'Payslip',
                        value: 'payslip',
                        description: 'Extract employer, employee, earnings, deductions, and net salary',
                    },
                    {
                        name: 'Purchase Order',
                        value: 'purchase_order',
                        description: 'Extract buyer, supplier, ordered items, and totals from purchase orders',
                    },
                    {
                        name: 'Receipt',
                        value: 'receipt',
                        description: 'Extract merchant, items, tax breakdown, totals, and payment method',
                    },
                ],
                // Default to 'generic' (cheap, no classification step). Never default
                // to 'auto' (deliberate classify-then-extract, extra cost) or 'fulltext'
                // (×10 billing) — those must be explicit opt-in choices.
                default: 'generic',
                description: 'Type of document — determines the extraction schema',
            },
        ],
    };
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data');
                const documentType = this.getNodeParameter('documentType', itemIndex, 'generic');
                // Validate documentType against known values (guards against crafted workflow JSON)
                if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Invalid document type: "${documentType}"`, { itemIndex });
                }
                // Get binary data
                const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
                // Validate MIME type — case-insensitive; reject undefined/empty to prevent silent bypass
                if (!(0, errors_1.isValidMimeType)(binaryData.mimeType)) {
                    throw (0, errors_1.createFileTypeError)(this.getNode(), binaryData.mimeType ?? 'unknown', itemIndex);
                }
                // Early size check from metadata before loading the full buffer into memory (DoS prevention).
                // Only accepts strict digit strings — parseInt would partially parse "123abc" → 123 or "1e9" → 1,
                // which could let oversized files bypass this guard. Non-matching values fall through to the
                // authoritative buffer-length check below.
                const rawFileSize = binaryData.fileSize;
                const metaSize = typeof rawFileSize === 'string' && /^[0-9]+$/.test(rawFileSize)
                    ? Number(rawFileSize)
                    : 0;
                if (metaSize > 0 && Number.isFinite(metaSize) && !(0, errors_1.isValidFileSize)(metaSize)) {
                    throw (0, errors_1.createFileSizeError)(this.getNode(), metaSize, itemIndex);
                }
                // Load buffer
                const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
                // Authoritative size check on actual buffer length
                if (!(0, errors_1.isValidFileSize)(buffer.length)) {
                    throw (0, errors_1.createFileSizeError)(this.getNode(), buffer.length, itemIndex);
                }
                // Sanitize filename to prevent path traversal and homograph attacks in multipart headers
                const safeFilename = (0, errors_1.sanitizeFilename)(binaryData.fileName ?? 'document');
                // Submit extraction job — multipart-only per the EXTRACTIONS_API_CONTRACT.
                // `document_type` is a REQUIRED form field. The closed 12-value enum
                // includes 'auto' as an explicit choice (deliberate classify-then-extract,
                // priced higher than picking a specific schema) — never default to it,
                // but always send whatever the user picked.
                const form = new FormData();
                form.append('file', new Blob([buffer], { type: binaryData.mimeType }), safeFilename);
                form.append('document_type', documentType);
                // Step 1: POST → 202 + Extraction { id, … }
                const submitResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'deepOcrApi', {
                    method: 'POST',
                    url: EXTRACTIONS_URL,
                    body: form,
                    // Fresh per-call copy — see CLIENT_HEADERS for the rationale.
                    headers: { ...CLIENT_HEADERS },
                });
                if (!isPlainObject(submitResponse)) {
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: 'Unexpected response format from Deep-OCR API (expected 202 + Extraction)' }, { itemIndex });
                }
                const submitted = submitResponse;
                const jobId = typeof submitted.id === 'string' ? submitted.id : undefined;
                if (typeof jobId !== 'string' || jobId.length === 0) {
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: 'Deep-OCR API did not return an extraction id' }, { itemIndex });
                }
                // Step 2: poll GET /v1/extractions/{id} until terminal — honour the
                // server's Retry-After header (seconds) when present, otherwise fall
                // back to a local 1s→5s backoff. HTTP 200 is not success on its own:
                // an HTTP-200 poll response with status='failed' must surface as an
                // error, hence the explicit status check. Polling order is GET-first,
                // sleep-after: a job that completes synchronously on the submit (small
                // docs often do) returns immediately on the first poll without eating
                // a full POLL_INITIAL_MS of latency.
                const startedAt = Date.now();
                let pollDelay = POLL_INITIAL_MS;
                let polled;
                while (true) {
                    const pollResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'deepOcrApi', {
                        method: 'GET',
                        url: extractionUrl(jobId),
                        returnFullResponse: true,
                        // Fresh per-call copy — see CLIENT_HEADERS for the rationale.
                        headers: { ...CLIENT_HEADERS },
                    });
                    // Strict full-response shape check: a regression that drops
                    // `returnFullResponse: true` (or a flat-out malformed reply) must
                    // surface immediately, not silently disable Retry-After parsing.
                    if (!isPlainObject(pollResponse) ||
                        !('body' in pollResponse) ||
                        !('headers' in pollResponse)) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), {
                            message: `Deep-OCR poll response for extraction ${jobId} is missing the body/headers wrapper (expected returnFullResponse output)`,
                        }, { itemIndex });
                    }
                    const pollRaw = pollResponse.body;
                    const retryAfterMs = parseRetryAfterMs(pollResponse.headers);
                    if (!isPlainObject(pollRaw)) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: `Unexpected poll response shape for extraction ${jobId}` }, { itemIndex });
                    }
                    polled = pollRaw;
                    const status = polled.status;
                    if (status === 'completed' || status === 'failed') {
                        break;
                    }
                    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), {
                            message: `Deep-OCR extraction ${jobId} did not reach a terminal state within ${POLL_TIMEOUT_MS / 1000}s (last status: ${typeof status === 'string' ? status : 'unknown'})`,
                        }, { itemIndex });
                    }
                    if (retryAfterMs !== undefined) {
                        // Honour the server's hint, clamped so a buggy header can't stall
                        // the workflow past the wall-clock timeout in a single sleep.
                        await (0, n8n_workflow_1.sleep)(Math.min(retryAfterMs, RETRY_AFTER_MAX_MS));
                        // Reset local backoff so a transient Retry-After spike doesn't
                        // permanently push subsequent fallback polls to the cap.
                        pollDelay = POLL_INITIAL_MS;
                    }
                    else {
                        await (0, n8n_workflow_1.sleep)(pollDelay);
                        pollDelay = Math.min(Math.floor(pollDelay * POLL_BACKOFF), POLL_MAX_MS);
                    }
                }
                // Step 3: dispatch on terminal status.
                if (polled.status === 'failed') {
                    const err = polled.error ?? {};
                    const code = typeof err.code === 'string' && err.code.length > 0 ? err.code : 'failed';
                    const message = typeof err.message === 'string' && err.message.length > 0
                        ? err.message
                        : `Deep-OCR extraction ${jobId} failed`;
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: `[${code}] ${message}` }, { itemIndex });
                }
                // status === 'completed' — unwrap $.result (defensive: tolerate missing fields)
                const result = polled.result ?? {};
                const content = result.content ?? {};
                returnData.push({
                    json: {
                        ...content,
                        document_type: result.document_type,
                        metadata: result.metadata,
                    },
                    pairedItem: { item: itemIndex },
                });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    const raw = error instanceof Error ? error.message : 'Unknown error occurred';
                    returnData.push({
                        json: { error: (0, errors_1.truncateErrorMessage)(raw) },
                        pairedItem: { item: itemIndex },
                    });
                    continue;
                }
                throw (0, errors_1.wrapUnknownError)(this.getNode(), error, itemIndex);
            }
        }
        return [returnData];
    }
}
exports.DeepOcr = DeepOcr;
//# sourceMappingURL=DeepOcr.node.js.map