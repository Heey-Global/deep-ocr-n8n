"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepOcrApi = void 0;
/**
 * Deep-OCR API Credentials
 *
 * Manages authentication with the Deep-OCR API using Bearer token.
 * The API key is stored securely and sent in the Authorization header.
 */
class DeepOcrApi {
    name = 'deepOcrApi';
    displayName = 'Deep-OCR API';
    icon = 'file:../nodes/DeepOcr/deepocr.svg';
    documentationUrl = 'https://deep-ocr.com';
    properties = [
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
    authenticate = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '={{"Bearer " + $credentials.apiKey}}',
            },
        },
    };
    test = {
        request: {
            baseURL: 'https://api.deep-ocr.com',
            url: '/health',
            method: 'GET',
        },
    };
}
exports.DeepOcrApi = DeepOcrApi;
//# sourceMappingURL=DeepOcrApi.credential.js.map