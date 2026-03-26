import { DeepOcr } from '../../src/nodes/DeepOcr/DeepOcr.node';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { mockDeep } from 'jest-mock-extended';

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

    it('should have documentType parameter defaulting to invoice', () => {
      const prop = node.description.properties.find((p) => p.name === 'documentType');
      expect(prop).toBeDefined();
      expect(prop?.type).toBe('options');
      expect(prop?.default).toBe('invoice');
    });

    it('should have all 11 document type options including auto-detect', () => {
      const prop = node.description.properties.find((p) => p.name === 'documentType');
      const options = prop?.options as Array<{ value: string }>;
      const values = options?.map((o) => o.value);
      expect(values).toContain('auto');
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
      expect(options).toHaveLength(11);
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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'invoice.pdf',
        document_type: 'invoice',
        content: { invoice_number: 'INV-001', total: 119.0 },
        metadata: { pages: 1, processing_time: 2.5 },
      });

      const result = await node.execute.call(mockExecuteFunctions);

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.invoice_number).toBe('INV-001');
      expect(result[0][0].json.total).toBe(119.0);
      expect(result[0][0].json.document_type).toBe('invoice');
      expect(result[0][0].json.filename).toBe('invoice.pdf');
      expect(result[0][0].pairedItem).toEqual({ item: 0 });
    });

    it('should omit document_type query param when type is auto', async () => {
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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'document.pdf',
        document_type: 'invoice',
        content: {},
        metadata: {},
      });

      await node.execute.call(mockExecuteFunctions);

      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
        'deepOcrApi',
        expect.objectContaining({
          qs: {},
        }),
      );
    });

    it('should send document_type as query param to /v1/ocr', async () => {
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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'receipt.png',
        document_type: 'receipt',
        content: { merchant: 'Supermarket', total: 42.5 },
        metadata: { pages: 1 },
      });

      await node.execute.call(mockExecuteFunctions);

      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
        'deepOcrApi',
        expect.objectContaining({
          method: 'POST',
          url: 'https://api.deep-ocr.com/v1/ocr',
          qs: { document_type: 'receipt' },
        }),
      );
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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'photo.jpg',
        document_type: 'receipt',
        content: {},
        metadata: {},
      });

      const result = await node.execute.call(mockExecuteFunctions);
      expect(result[0]).toHaveLength(1);
    });

    it('should validate file size (max 10MB)', async () => {
      const inputItems: INodeExecutionData[] = [{ json: {} }];
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'passwd.pdf',
        document_type: 'invoice',
        content: {},
        metadata: {},
      });

      await node.execute.call(mockExecuteFunctions);

      // Verify the API was called — if filename sanitization threw or crashed, this would fail
      expect(mockExecuteFunctions.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
      // Verify the body is a FormData instance (native multipart upload)
      const callArgs = (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
      expect(callArgs.body).toBeInstanceOf(FormData);
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
        fileSize: String(20 * 1024 * 1024), // 20MB in metadata
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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'test.pdf',
        document_type: 'invoice',
        content: {},
        metadata: {},
      });

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

      await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow(originalError);
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
      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'test.pdf',
        document_type: 'invoice',
        content: null,
        metadata: {},
      });

      const result = await node.execute.call(mockExecuteFunctions);

      // Null content is treated as empty object — other fields are still preserved
      expect(result[0][0].json.filename).toBe('test.pdf');
      expect(result[0][0].json.document_type).toBe('invoice');
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

      (mockExecuteFunctions.helpers.httpRequestWithAuthentication as jest.Mock).mockResolvedValue({
        success: true,
        filename: 'invoice.pdf',
        document_type: 'invoice',
        content: { invoice_number: 'INV-001' },
        metadata: {},
      });

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
});
