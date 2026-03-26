import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
/**
 * Deep-OCR Node
 *
 * Extract structured data from documents using the Deep-OCR API.
 * Supports PDF, PNG, JPG, JPEG, and WebP formats up to 10MB.
 */
export declare class DeepOcr implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
//# sourceMappingURL=DeepOcr.node.d.ts.map