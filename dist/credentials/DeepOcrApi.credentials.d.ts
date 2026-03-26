import type { ICredentialType, INodeProperties, ICredentialTestRequest, IAuthenticateGeneric } from 'n8n-workflow';
/**
 * Deep-OCR API Credentials
 *
 * Manages authentication with the Deep-OCR API using Bearer token.
 * The API key is stored securely and sent in the Authorization header.
 */
export declare class DeepOcrApi implements ICredentialType {
    name: string;
    displayName: string;
    icon: "file:../nodes/DeepOcr/deepocr.svg";
    documentationUrl: string;
    properties: INodeProperties[];
    authenticate: IAuthenticateGeneric;
    test: ICredentialTestRequest;
}
//# sourceMappingURL=DeepOcrApi.credentials.d.ts.map