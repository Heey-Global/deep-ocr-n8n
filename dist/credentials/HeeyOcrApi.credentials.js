"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeeyOcrApi = void 0;
/**
 * Heey OCR API Credentials
 *
 * Manages authentication with the Heey OCR API using Bearer token.
 * The API key is stored securely and sent in the Authorization header.
 */
class HeeyOcrApi {
    name = 'heeyOcrApi';
    displayName = 'Heey OCR API';
    icon = 'file:../nodes/HeeyOcr/deepocr.svg';
    documentationUrl = 'https://heey-ocr.com';
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
            description: 'The API key for authenticating with Heey OCR service',
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
            baseURL: 'https://api.heey-ocr.com',
            url: '/health',
            method: 'GET',
        },
    };
}
exports.HeeyOcrApi = HeeyOcrApi;
//# sourceMappingURL=HeeyOcrApi.credentials.js.map