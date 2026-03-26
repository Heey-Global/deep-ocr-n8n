import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, NodeConnectionTypes } from 'n8n-workflow';
import {
  isValidMimeType,
  isValidFileSize,
  createFileTypeError,
  createFileSizeError,
} from '../../utils/errors';

const ALLOWED_DOCUMENT_TYPES = [
  'auto',
  'bank_statement',
  'contract',
  'delivery_note',
  'generic',
  'handwriting',
  'id_document',
  'invoice',
  'payslip',
  'purchase_order',
  'receipt',
] as const;

/**
 * Response structure from the Deep-OCR API
 * { success, filename, document_type, content, metadata }
 */
interface OcrApiResponse {
  success?: boolean;
  filename?: string;
  document_type?: string;
  content?: IDataObject;
  metadata?: IDataObject;
  [key: string]: unknown;
}

/**
 * Deep-OCR Node
 *
 * Extract structured data from documents using the Deep-OCR API.
 * Supports PDF, PNG, JPG, JPEG, and WebP formats up to 10MB.
 */
export class DeepOcr implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Deep-OCR',
    name: 'deepOcr',
    icon: 'file:deepocr.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["documentType"]}}',
    description: 'Extract structured data from documents using Deep-OCR API',
    defaults: {
      name: 'Deep-OCR',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
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
      },
      {
        displayName: 'Document Type',
        name: 'documentType',
        type: 'options',
        options: [
          {
            name: 'Auto-Detect',
            value: 'auto',
            description: 'Let the API classify the document automatically (one extra API call)',
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
        default: 'invoice',
        description: 'Type of document — determines the extraction schema',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data');
        const documentType = this.getNodeParameter('documentType', itemIndex, 'invoice') as string;

        // Validate documentType against known values (guards against crafted workflow JSON)
        if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
          throw new NodeOperationError(
            this.getNode(),
            `Invalid document type: "${documentType}"`,
            { itemIndex },
          );
        }

        // Get binary data
        const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

        // Validate MIME type — reject undefined/empty to prevent silent bypass
        if (!isValidMimeType(binaryData.mimeType)) {
          throw createFileTypeError(this.getNode(), binaryData.mimeType ?? 'unknown', itemIndex);
        }

        // Early size check from metadata before loading the full buffer into memory (DoS prevention)
        const metaSize = parseInt(binaryData.fileSize ?? '0', 10);
        if (metaSize > 0 && !isValidFileSize(metaSize)) {
          throw createFileSizeError(this.getNode(), metaSize, itemIndex);
        }

        // Load buffer
        const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

        // Authoritative size check on actual buffer length
        if (!isValidFileSize(buffer.length)) {
          throw createFileSizeError(this.getNode(), buffer.length, itemIndex);
        }

        // Sanitize filename to prevent path traversal sequences in multipart headers
        const rawFilename = binaryData.fileName ?? 'document';
        const safeFilename =
          rawFilename
            .replace(/\.\./g, '')
            .replace(/[/\\]/g, '_')
            .replace(/[<>:"|?*\x00-\x1f]/g, '')
            .substring(0, 255) || 'document';

        // Make API request — document_type as query param, file as multipart.
        // When documentType is 'auto', omit the parameter entirely so the API
        // classifies the document automatically.
        // requestWithAuthentication (request-library) is used because httpRequestWithAuthentication
        // (IHttpRequestOptions) does not support the formData property for multipart uploads.
        // eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions -- httpRequestWithAuthentication (IHttpRequestOptions) does not support formData for multipart uploads
        const rawResponse: unknown = await this.helpers.requestWithAuthentication.call(
          this,
          'deepOcrApi',
          {
            method: 'POST',
            url: 'https://api.deep-ocr.com/v1/ocr',
            qs: documentType !== 'auto' ? { document_type: documentType } : {},
            formData: {
              file: {
                value: buffer,
                options: {
                  filename: safeFilename,
                  contentType: binaryData.mimeType,
                },
              },
            },
            json: true,
          },
        );

        // Validate response structure before accessing fields
        if (rawResponse === null || rawResponse === undefined || typeof rawResponse !== 'object') {
          throw new NodeApiError(
            this.getNode(),
            { message: 'Unexpected response format from Deep-OCR API' } as JsonObject,
            { itemIndex },
          );
        }
        const response = rawResponse as OcrApiResponse;

        // API always returns structured JSON in response.content
        const content: IDataObject = (response.content as IDataObject) ?? {};
        returnData.push({
          json: {
            ...content,
            filename: response.filename,
            document_type: response.document_type,
            metadata: response.metadata,
          },
          pairedItem: { item: itemIndex },
        });
      } catch (error: unknown) {
        if (this.continueOnFail()) {
          const raw = error instanceof Error ? error.message : 'Unknown error occurred';
          // Truncate to prevent verbose API errors from leaking document content into workflow logs
          const errorMessage = raw.length > 200 ? raw.substring(0, 200) + '…' : raw;
          returnData.push({
            json: { error: errorMessage },
            pairedItem: { item: itemIndex },
          });
          continue;
        }
        if (error instanceof NodeApiError || error instanceof NodeOperationError) {
          throw error;
        }
        const errorObject: JsonObject = {
          message: error instanceof Error ? error.message : 'Unknown error',
        };
        throw new NodeApiError(this.getNode(), errorObject, {
          message: 'Failed to process document with Deep-OCR API',
          itemIndex,
        });
      }
    }

    return [returnData];
  }
}
