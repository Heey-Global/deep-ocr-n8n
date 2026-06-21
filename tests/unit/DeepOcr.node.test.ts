import { DeepOcr } from '../../src/nodes/DeepOcr/DeepOcr.node';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { mockDeep } from 'jest-mock-extended';
// Same source of truth the production code reads — guarantees the client-id
// assertion stays in lockstep with whatever semantic-release publishes.
import { version as PACKAGE_VERSION } from '../../package.json';

// Stub the polling sleep so tests don't actually wait between polls.
// The Promise resolves immediately, preserving the await-chain semantics.
jest.mock('n8n-workflow', () => {
  const actual = jest.requireActual('n8n-workflow');
  return { ...actual, sleep: jest.fn().mockResolvedValue(undefined) };
});

/**
 * Helper: queue the two API responses the new async flow expects from a single
 * successful extraction — POST → 202 { id } → poll → full-response wrap of
 * { status: 'completed', result }. The poll mock returns a `{ body, headers }`
 * shape (no Retry-After) so it matches what `returnFullResponse: true` produces.
 */
const mockExtractionSuccess = (
  mock: jest.Mock,
  resultBody: { document_type?: string; content?: unknown; metadata?: unknown },
  id = 'ext_test_1',
): void => {
  mock
    .mockResolvedValueOnce({ id })
    .mockResolvedValueOnce(pollResp({ status: 'completed', result: resultBody }));
};

/**
 * Wrap a GET-poll body in the `{ body, headers }` shape that
 * `returnFullResponse: true` produces. Every poll mock uses this so a future
 * change that drops `returnFullResponse: true` would break tests immediately
 * rather than silently lose Retry-After parsing.
 */
const pollResp = (
  body: unknown,
  headers: Record<string, string | number> = {},
): { body: unknown; headers: Record<string, string | number> } => ({ body, headers });

describe('DeepOcr Node', () => {
  let node: DeepOcr;

  beforeEach(() => {
    node = new DeepOcr();
  });

  describe('node description', () => {
    it('should have correct display name', () => {
      expect(node.description.displayName).toBe('Deep-OCR');
    });

    it('should have correct internal name', () => {
      expect(node.description.name).toBe('deepOcr');
    });

    it('should have correct icon', () => {
      expect(node.description.icon).toBe('file:deepocr.svg');
    });

    it('should be in transform group', () => {
      expect(node.description.group).toContain('transform');
    });

    it('should have version 1', () => {
      expect(node.description.version).toBe(1);
    });

    it('should have one main input', () => {
      expect(node.description.inputs).toEqual(['main']);
    });

    it('should have one main output', () => {
      expect(node.description.outputs).toEqual(['main']);
    });

    it('should require deepOcrApi credentials', () => {
      const credentialConfig = node.description.credentials?.find(
        (c) => c.name === 'deepOcrApi',
      );
      expect(credentialConfig).toBeDefined();
      expect(credentialConfig?.required).toBe(true);
    });

    it('should be usable as tool', () => {
      expect(node.description.usableAsTool).toBe(true);
    });

  });

  describe('node properties', () => {
    it('should have binaryPropertyName parameter', () => {
      const prop = node.description.properties.find((p) => p.name === 'binaryPropertyName');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe('string');
      expect(prop?.default).toBe('data');
      expect(prop?.required).toBe(true);
    });

    it('should have documentType parameter defaulting to generic', () => {
      // 'generic' is the cheap fallback schema — no classification step.
      // 'auto' (deliberate classify-then-extract, extra cost) and 'fulltext'
      // (×10 billing) must never be the pre-selected default; both are
      // explicit opt-in choices the user has to consciously pick.
      const prop = node.description.properties.find((p) => p.name === 'documentType');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe('options');
      expect(prop?.default).toBe('generic');
    });

    it('exposes all 12 contract DocumentType values', () => {
      const prop = node.description.properties.find((p) => p.name === 'documentType');
      const options = prop?.options as Array<{ value: string }>;
      const values = options?.map((o) => o.value);
      // 12 closed enum values from the contract — every value is sent verbatim
      // as the `document_type` form field at submit.
      expect(values).toContain('invoice');
      expect(values).toContain('receipt');
      expect(values).toContain('contract');
      expect(values).toContain('id_document');
      expect(values).toContain('delivery_note');
      expect(values).toContain('handwriting');
      expect(values).toContain('generic');
      expect(values).toContain('bank_statement');
      expect(values).toContain('payslip');
      expect(values).toContain('purchase_order');
      expect(values).toContain('fulltext');
      expect(values).toContain('auto');
      expect(options).toHaveLength(12);
    });
  });

  describe('execute method', () => {
    let mockExecuteFunctions: IExecuteFunctions;

    beforeEach(() => {
      mockExecuteFunctions = mockDeep<IExecuteFunctions>();
    });

    it('should process invoice and return structured content', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'invoice.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        {
          document_type: 'invoice',
          content: { invoice_number: 'INV-001', total: 119.0 },
          metadata: { pages: 1, processing_time: 2.5 },
        },
      );

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.invoice_number).toBe('INV-001');
      expect(result[0][0].json.total).toBe(119.0);
      expect(result[0][0].json.document_type).toBe('invoice');
      // Contract pin: filenames are never returned by the API (privacy).
      // The output must NOT carry a `filename` field.
      expect(result[0][0].json.filename).toBeUndefined();
      expect(result[0][0].pairedItem).toEqual({ item: 0 });
    });

    it('sends document_type=auto verbatim when the user opts into auto-detect', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('auto');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'document.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'invoice', content: {}, metadata: {} },
      );

      await node.execute.call(mockExecuteFunctions);

      // The 12-value closed enum re-includes 'auto' as an explicit value
      // (deliberate classify-then-extract, higher cost). document_type is a
      // REQUIRED form field — always send whatever the user picked, never
      // omit it. The server bills the extra classification pass.
      const postCall = (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mock
        .calls[0][1];
      expect(postCall.qs).toBeUndefined();
      const form = postCall.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get('document_type')).toBe('auto');
      expect(form.get('file')).toBeInstanceOf(Blob);
    });

    it('should POST to /v1/extractions with document_type in the multipart form', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('receipt');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'image/png',
        fileName: 'receipt.png',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        {
          document_type: 'receipt',
          content: { merchant: 'Supermarket', total: 42.5 },
          metadata: { pages: 1 },
        },
        'ext_receipt_1',
      );

      await node.execute.call(mockExecuteFunctions);

      // Call 0: POST /v1/extractions — multipart only, no qs, document_type in the form
      const postCall = (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mock
        .calls[0][1];
      expect(postCall.method).toBe('POST');
      expect(postCall.url).toBe('https://api.deep-ocr.com/v1/extractions');
      expect(postCall.qs).toBeUndefined();
      const form = postCall.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get('document_type')).toBe('receipt');
      expect(form.get('file')).toBeInstanceOf(Blob);

      // Call 1: GET /v1/extractions/{id} with returnFullResponse so headers (Retry-After) are visible.
      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenNthCalledWith(
        2,
        'deepOcrApi',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.deep-ocr.com/v1/extractions/ext_receipt_1',
          returnFullResponse: true,
        }),
      );
    });

    it('passes through document_type=fulltext to the form field and unwraps the markdown payload', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('fulltext');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'longread.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        {
          document_type: 'fulltext',
          // contract pin: fulltext result.content is { markdown: "…" }
          content: { markdown: '# Heading\n\nBody paragraph.' },
          metadata: { pages: 3, pages_billed: 30 },
        },
        'ext_fulltext_1',
      );

      const result = await node.execute.call(mockExecuteFunctions);

      // POST form carries document_type=fulltext (never auto-classified server-side)
      const postCall = (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mock
        .calls[0][1];
      const form = postCall.body as FormData;
      expect(form.get('document_type')).toBe('fulltext');

      // Markdown payload spread into the output json under its own key
      expect(result[0][0].json.markdown).toBe('# Heading\n\nBody paragraph.');
      expect(result[0][0].json.document_type).toBe('fulltext');
      expect(result[0][0].json.metadata).toEqual({ pages: 3, pages_billed: 30 });
    });

    it('should validate file type', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'text/plain',
        fileName: 'test.txt',
      });
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow('Unsupported file type');
    });

    it('should accept MIME types case-insensitively', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'image/JPEG', // uppercase — should still be accepted
        fileName: 'photo.jpg',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'receipt', content: {}, metadata: {} },
      );

      const result = await node.execute.call(mockExecuteFunctions);
      expect(result[0]).toHaveLength(1);
    });

    it('should validate file size (max 100MB per contract)', async () => {
      // 100MB + 1 byte — minimum size that should still be rejected with the
      // contract-aligned limit. Allocating ~100MB in the test runner is fine
      // (Buffer.alloc fills with zeros, no memory pressure).
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const largeBuffer = Buffer.alloc(100 * 1024 * 1024 + 1);

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'large.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(largeBuffer);
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow('exceeds maximum allowed size');
    });

    it('should accept a file exactly at the 100MB limit', async () => {
      // Boundary case: the contract says 100MB is INCLUSIVE — proves the
      // limit isn't off-by-one strict (would reject the exact-100MB case).
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const exactlyLimitBuffer = Buffer.alloc(100 * 1024 * 1024);

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'boundary.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(
        exactlyLimitBuffer,
      );
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'invoice', content: {}, metadata: {} },
      );

      const result = await node.execute.call(mockExecuteFunctions);
      expect(result[0]).toHaveLength(1);
    });

    it('should accept TIFF documents (image/tiff per the API allowlist)', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test tiff content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'image/tiff',
        fileName: 'scan.tiff',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'invoice', content: {}, metadata: {} },
      );

      const result = await node.execute.call(mockExecuteFunctions);
      expect(result[0]).toHaveLength(1);
    });

    it('should reject invalid documentType from crafted workflow JSON', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('malicious_type');
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'Invalid document type: "malicious_type"',
      );
    });

    it('should sanitize path-traversal sequences in filename', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: '../../etc/passwd.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'invoice', content: {}, metadata: {} },
      );

      await node.execute.call(mockExecuteFunctions);

      // POST (call 0) + poll GET (call 1) = 2 calls total for one item
      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
      // The POST body is a FormData instance (native multipart upload)
      const postCallArgs = (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
      expect(postCallArgs.body).toBeInstanceOf(FormData);
    });

    it('should throw on non-object API response', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue('not an object');
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'Unexpected response format from Deep-OCR API',
      );
    });

    it('should reject oversized file via metadata before loading buffer', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'huge.pdf',
        fileSize: String(200 * 1024 * 1024), // 200MB in metadata — comfortably above the 100MB limit
      });
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow('exceeds maximum allowed size');
      // Buffer should never have been loaded
      expect(mockExecuteFunctions.helpers.getBinaryDataBuffer).not.toHaveBeenCalled();
    });

    it('should safely handle non-numeric fileSize in binary metadata', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
        fileSize: 'invalid', // Non-numeric — parseInt returns NaN, should be treated as 0
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'invoice', content: {}, metadata: {} },
      );

      // Should not throw — NaN is normalised to 0, buffer-size check handles validation
      const result = await node.execute.call(mockExecuteFunctions);
      expect(result[0]).toHaveLength(1);
    });

    it('should handle continueOnFail gracefully', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'text/plain',
        fileName: 'test.txt',
      });
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(true);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0][0].json.error).toBeDefined();
      expect(typeof result[0][0].json.error).toBe('string');
      // Error messages must be truncated to prevent document content leaking into logs
      expect((result[0][0].json.error as string).length).toBeLessThanOrEqual(200);
    });

    it('should wrap unexpected errors in NodeApiError', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockRejectedValue(new TypeError('Unexpected network failure'));
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'Failed to process document with Deep-OCR API',
      );
    });

    it('should re-throw NodeApiError without wrapping', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');
      const originalError = new NodeApiError(
        { name: 'Deep-OCR' } as never,
        { message: 'API rate limit exceeded' },
      );

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockRejectedValue(originalError);
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toBe(originalError);
    });

    it('should handle network errors gracefully with continueOnFail', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockRejectedValue(new Error('ECONNREFUSED: connection refused'));
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(true);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0][0].json.error).toBeDefined();
      expect(typeof result[0][0].json.error).toBe('string');
      expect((result[0][0].json.error as string).length).toBeLessThanOrEqual(200);
    });

    it('should handle API response with null content', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const binaryBuffer = Buffer.from('test pdf content');

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(binaryBuffer);
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        { document_type: 'invoice', content: null, metadata: {} },
      );

      const result = await node.execute.call(mockExecuteFunctions);

      // Null content is treated as empty object — other contract fields are still preserved
      expect(result[0][0].json.document_type).toBe('invoice');
      // filename is not in the contract → must not surface in the output
      expect(result[0][0].json.filename).toBeUndefined();
    });

    it('should process multiple items independently with continueOnFail', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }, { json: {} }];

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(true);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      // Item 0: valid PDF → success
      // Item 1: invalid MIME type → error captured via continueOnFail
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')     // item 0: binaryPropertyName
        .mockReturnValueOnce('invoice')  // item 0: documentType
        .mockReturnValueOnce('data')     // item 1: binaryPropertyName
        .mockReturnValueOnce('invoice'); // item 1: documentType

      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock)
        .mockReturnValueOnce({ mimeType: 'application/pdf', fileName: 'invoice.pdf' })
        .mockReturnValueOnce({ mimeType: 'text/plain', fileName: 'bad.txt' });

      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock)
        .mockResolvedValue(Buffer.from('test content'));

      // Item 0 makes 2 API calls (POST + poll); item 1 fails on MIME-type validation before any call.
      mockExtractionSuccess(
        mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
        {
          document_type: 'invoice',
          content: { invoice_number: 'INV-001' },
          metadata: {},
        },
      );

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0]).toHaveLength(2);
      expect(result[0][0].json.invoice_number).toBe('INV-001'); // Item 0: success
      expect(result[0][1].json.error).toBeDefined();            // Item 1: graceful failure
      expect(result[0][0].pairedItem).toEqual({ item: 0 });
      expect(result[0][1].pairedItem).toEqual({ item: 1 });
    });

    it('should handle binary data read failure', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];

      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue(inputItems);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock)
        .mockRejectedValue(new Error('Failed to read binary data from storage'));
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'Failed to process document with Deep-OCR API',
      );
    });
  });

  describe('async job lifecycle', () => {
    let mockExecuteFunctions: ReturnType<typeof mockDeep<IExecuteFunctions>>;

    /** Pre-fills the input/binary boilerplate that every async-flow test needs. */
    const setupHappyInputs = (): void => {
      (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue([{ json: {} }]);
      (mockExecuteFunctions.getNodeParameter as jest.Mock)
        .mockReturnValueOnce('data')
        .mockReturnValueOnce('invoice');
      (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
        mimeType: 'application/pdf',
        fileName: 'test.pdf',
      });
      (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(
        Buffer.from('test pdf content'),
      );
      (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
      (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });
    };

    beforeEach(() => {
      mockExecuteFunctions = mockDeep<IExecuteFunctions>();
    });

    it('sends User-Agent + X-Deep-OCR-Client on BOTH the POST submit AND the GET poll', async () => {
      // Drift-1 fix: every outbound async call (submit + every poll) MUST
      // carry the client-identifier headers so deep-ocr-api can attribute
      // async traffic. PACKAGE_VERSION is imported from the same package.json
      // the production code reads, so the assertion tracks semantic-release
      // bumps automatically. We also run TWO executions to verify the
      // per-call spread defends the module-level CLIENT_HEADERS constant
      // against mutation accumulation in OUR code path.
      const expectedClientId = `deep-ocr-n8n/${PACKAGE_VERSION}`;
      const runOnce = (): void => {
        (mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue([{ json: {} }]);
        (mockExecuteFunctions.getNodeParameter as jest.Mock)
          .mockReturnValueOnce('data')
          .mockReturnValueOnce('invoice');
        (mockExecuteFunctions.helpers.assertBinaryData as jest.Mock).mockReturnValue({
          mimeType: 'application/pdf',
          fileName: 'test.pdf',
        });
        (mockExecuteFunctions.helpers.getBinaryDataBuffer as jest.Mock).mockResolvedValue(
          Buffer.from('test pdf content'),
        );
        (mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(false);
        (mockExecuteFunctions.getNode as jest.Mock).mockReturnValue({ name: 'Deep-OCR' });
        mockExtractionSuccess(
          mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock,
          { document_type: 'invoice', content: {}, metadata: {} },
        );
      };

      runOnce();
      await node.execute.call(mockExecuteFunctions);
      runOnce();
      await node.execute.call(mockExecuteFunctions);

      const mock = mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock;
      // 2 calls per execution (POST + 1 poll → completed) × 2 executions = 4.
      expect(mock).toHaveBeenCalledTimes(4);

      const headersOf = (callIdx: number): Record<string, string> =>
        (mock.mock.calls[callIdx][1] as { headers: Record<string, string> }).headers;

      const submit1 = headersOf(0); // first execution: POST
      const poll1 = headersOf(1); //  first execution: GET
      const submit2 = headersOf(2); // second execution: POST
      const poll2 = headersOf(3); //  second execution: GET

      // Every call site (POST + GET, on every execution) carries both headers.
      for (const headers of [submit1, poll1, submit2, poll2]) {
        expect(headers).toEqual(
          expect.objectContaining({
            'User-Agent': expectedClientId,
            'X-Deep-OCR-Client': expectedClientId,
          }),
        );
        expect(Object.keys(headers).sort()).toEqual(
          ['User-Agent', 'X-Deep-OCR-Client'].sort(),
        );
      }

      // All four header objects are distinct references — confirms the call
      // site spreads into a fresh per-call copy and the shared CLIENT_HEADERS
      // constant isn't mutated across either intra-execution (POST → GET) or
      // cross-execution (run #1 → run #2) boundaries.
      const headersSet = new Set([submit1, poll1, submit2, poll2]);
      expect(headersSet.size).toBe(4);
    });

    it('polls through non-terminal statuses until the job is completed', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        // POST → 202 (Extraction { id })
        .mockResolvedValueOnce({ id: 'ext_async_1' })
        // GET poll #1 → queued
        .mockResolvedValueOnce(pollResp({ status: 'queued' }))
        // GET poll #2 → processing
        .mockResolvedValueOnce(pollResp({ status: 'processing' }))
        // GET poll #3 → completed with result
        .mockResolvedValueOnce(
          pollResp({
            status: 'completed',
            result: {
              document_type: 'invoice',
              content: { invoice_number: 'INV-42' },
              metadata: { pages: 1 },
            },
          }),
        );

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.invoice_number).toBe('INV-42');
      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
    });

    it('surfaces the structured error envelope when status is failed', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_fail_1' })
        .mockResolvedValueOnce(
          pollResp({
            status: 'failed',
            error: { code: 'UNREADABLE_DOCUMENT', message: 'PDF is encrypted' },
          }),
        );

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        '[UNREADABLE_DOCUMENT] PDF is encrypted',
      );
    });

    it('falls back to a default error message when failed status lacks an envelope', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_fail_bare' })
        .mockResolvedValueOnce(pollResp({ status: 'failed' }));

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        '[failed] Deep-OCR extraction ext_fail_bare failed',
      );
    });

    it('rejects when the POST 202 body does not include an extraction id', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValueOnce({
        unrelated: true,
      });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'did not return an extraction id',
      );
    });

    it('threads the contract id (ext_<uuid>) into the poll URL verbatim', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_2c6f0d8e_4ab1' })
        .mockResolvedValueOnce(
          pollResp({
            status: 'completed',
            result: { document_type: 'invoice', content: {}, metadata: {} },
          }),
        );

      const result = await node.execute.call(mockExecuteFunctions);
      expect(result[0]).toHaveLength(1);
      // Poll URL must reflect the id from the contract response
      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenNthCalledWith(
        2,
        'deepOcrApi',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.deep-ocr.com/v1/extractions/ext_2c6f0d8e_4ab1',
          returnFullResponse: true,
        }),
      );
    });

    it('rejects when a poll response body is not an object', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_bad_poll' })
        .mockResolvedValueOnce(pollResp('not-an-object'));

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'Unexpected poll response shape for extraction ext_bad_poll',
      );
    });

    it('gives up after the polling timeout when no terminal status arrives', async () => {
      setupHappyInputs();
      // POST → id, then every poll returns 'processing' forever
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_stuck' })
        .mockResolvedValue(pollResp({ status: 'processing' }));

      // Deterministic Date.now: first read = baseline (startedAt), subsequent
      // reads return the trip value so the guard fires after the first poll.
      // The spy counts calls so a future edit that adds more Date.now() reads
      // before the guard would break this assertion, surfacing the regression.
      const tripPoint = 1_000_000 + (5 * 60_000) + 1;
      let nowCallCount = 0;
      const realDateNow = Date.now;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        nowCallCount += 1;
        return nowCallCount === 1 ? 1_000_000 : tripPoint;
      });

      try {
        await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
          /did not reach a terminal state within 300s/,
        );
        // Make sure the guard was reached via real polling, not by mis-sequencing.
        expect(nowCallCount).toBeGreaterThanOrEqual(2);
      } finally {
        (Date.now as jest.SpyInstance).mockRestore();
        Date.now = realDateNow;
      }
    });

    it('surfaces an asymmetric error envelope (code present, message missing)', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_asym_1' })
        .mockResolvedValueOnce(
          pollResp({
            status: 'failed',
            // code present, message missing — falls back to the default message,
            // keeping the code intact in the bracket prefix.
            error: { code: 'BAD_PDF' },
          }),
        );

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        '[BAD_PDF] Deep-OCR extraction ext_asym_1 failed',
      );
    });

    it('rejects an array-shaped poll body without waiting for the timeout', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_array_body' })
        .mockResolvedValueOnce(pollResp([]));

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        'Unexpected poll response shape for extraction ext_array_body',
      );
    });

    it('rejects a poll response missing the body/headers full-response wrapper', async () => {
      setupHappyInputs();
      // Simulates a regression where `returnFullResponse: true` got dropped
      // from the GET options: the inline wrapper-shape check in execute()
      // refuses to fall through silently — it throws so the bug surfaces
      // immediately rather than silently disabling Retry-After parsing.
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_no_wrap' })
        .mockResolvedValueOnce({ status: 'completed', result: { content: {} } });

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(
        /is missing the body\/headers wrapper/,
      );
    });

    it('honours the Retry-After header (seconds) instead of the local backoff', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        // POST → 202
        .mockResolvedValueOnce({ id: 'ext_retry_after' })
        // Poll 1: non-terminal, server says "come back in 3 seconds"
        .mockResolvedValueOnce({
          body: { status: 'processing' },
          headers: { 'retry-after': '3' },
        })
        // Poll 2: completed
        .mockResolvedValueOnce({
          body: {
            status: 'completed',
            result: {
              document_type: 'invoice',
              content: { invoice_number: 'RA-1' },
              metadata: {},
            },
          },
          headers: {},
        });

      // Get a handle on the mocked sleep so we can assert it was awaited with
      // exactly the server-hinted value (3000 ms), not POLL_INITIAL_MS (1000 ms).
      const { sleep } = jest.requireMock('n8n-workflow') as { sleep: jest.Mock };
      sleep.mockClear();

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.invoice_number).toBe('RA-1');
      // Exactly one sleep happened (between poll 1 and poll 2), at 3000 ms —
      // the Retry-After value, not the local POLL_INITIAL_MS.
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(3000);
    });

    it('clamps a pathological Retry-After header to a safe upper bound', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_retry_huge' })
        .mockResolvedValueOnce({
          body: { status: 'processing' },
          headers: { 'retry-after': '999999' },
        })
        .mockResolvedValueOnce({
          body: {
            status: 'completed',
            result: { document_type: 'invoice', content: {}, metadata: {} },
          },
          headers: {},
        });

      const { sleep } = jest.requireMock('n8n-workflow') as { sleep: jest.Mock };
      sleep.mockClear();

      await node.execute.call(mockExecuteFunctions);

      // Clamp prevents a buggy/abusive header from stalling the workflow past
      // the timeout in a single sleep. RETRY_AFTER_MAX_MS = 30s.
      expect(sleep).toHaveBeenCalledWith(30_000);
    });

    it('ignores a non-numeric Retry-After header and uses the local backoff', async () => {
      setupHappyInputs();
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock)
        .mockResolvedValueOnce({ id: 'ext_retry_bad' })
        .mockResolvedValueOnce({
          body: { status: 'processing' },
          headers: { 'retry-after': 'next Tuesday' },
        })
        .mockResolvedValueOnce({
          body: {
            status: 'completed',
            result: { document_type: 'invoice', content: {}, metadata: {} },
          },
          headers: {},
        });

      const { sleep } = jest.requireMock('n8n-workflow') as { sleep: jest.Mock };
      sleep.mockClear();

      await node.execute.call(mockExecuteFunctions);

      // Garbage header → fall through to POLL_INITIAL_MS (1000 ms) only — no
      // double-sleep with a garbage-derived value sneaking in alongside.
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(1000);
    });
  });
});
