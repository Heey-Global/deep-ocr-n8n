import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
/**
 * Deep-OCR Node
 *
 * AI-powered OCR for invoices, receipts, contracts, IDs, bank statements
 * and more — returns structured JSON ready to use.
 * Supports PDF, PNG, JPG, JPEG, and WebP formats up to 10MB.
 */
export declare class DeepOcr implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
//# sourceMappingURL=DeepOcr.node.d.ts.map