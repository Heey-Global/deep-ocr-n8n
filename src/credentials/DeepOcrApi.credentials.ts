import type {
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
  IAuthenticateGeneric,
} from 'n8n-workflow';

/**
 * Deep-OCR API Credentials
 *
 * Manages authentication with the Deep-OCR API using Bearer token.
 * The API key is stored securely and sent in the Authorization header.
 */
export class DeepOcrApi implements ICredentialType {
  name = 'deepOcrApi';
  displayName = 'Deep-OCR API';
  icon = 'file:../nodes/DeepOcr/deepocr.svg' as const;
  documentationUrl = 'https://deep-ocr.com';

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
      description: 'The API key for authenticating with Deep-OCR service',
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
      baseURL: 'https://api.deep-ocr.com',
      url: '/health',
      method: 'GET',
    },
  };
}
