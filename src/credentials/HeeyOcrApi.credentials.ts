import type {
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
  IAuthenticateGeneric,
} from 'n8n-workflow';

/**
 * Heey OCR API Credentials
 *
 * Manages authentication with the Heey OCR API using Bearer token.
 * The API key is stored securely and sent in the Authorization header.
 */
export class HeeyOcrApi implements ICredentialType {
  name = 'heeyOcrApi';
  displayName = 'Heey OCR API';
  icon = 'file:../nodes/HeeyOcr/deepocr.svg' as const;
  documentationUrl = 'https://heey-ocr.com';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'The API key for authenticating with Heey OCR service',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '={{"Bearer " + $credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.heey-ocr.com',
      url: '/health',
      method: 'GET',
    },
  };
}
