import type { ICredentialType, INodeProperties, ICredentialTestRequest, IAuthenticateGeneric } from 'n8n-workflow';
/**
 * Heey OCR API Credentials
 *
 * Manages authentication with the Heey OCR API using Bearer token.
 * The API key is stored securely and sent in the Authorization header.
 */
export declare class HeeyOcrApi implements ICredentialType {
    name: string;
    displayName: string;
    icon: "file:../nodes/HeeyOcr/deepocr.svg";
    documentationUrl: string;
    properties: INodeProperties[];
    authenticate: IAuthenticateGeneric;
    test: ICredentialTestRequest;
}
//# sourceMappingURL=HeeyOcrApi.credentials.d.ts.map