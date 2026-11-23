import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
/**
 * Heey OCR Node
 *
 * AI-powered OCR for invoices, receipts, contracts, IDs, bank statements
 * and more — returns structured JSON ready to use.
 * Supports PDF, PNG, JPG, JPEG, WebP, and TIFF formats up to 100MB.
 */
export declare class HeeyOcr implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
//# sourceMappingURL=HeeyOcr.node.d.ts.map