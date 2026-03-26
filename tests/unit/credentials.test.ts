import { DeepOcrApi } from '../../src/credentials/DeepOcrApi.credential';

describe('DeepOcrApi Credentials', () => {
  let credentials: DeepOcrApi;

  beforeEach(() => {
    credentials = new DeepOcrApi();
  });

  describe('credential properties', () => {
    it('should have correct name', () => {
      expect(credentials.name).toBe('deepOcrApi');
    });

    it('should have correct display name', () => {
      expect(credentials.displayName).toBe('Deep-OCR API');
    });

    it('should have documentation URL', () => {
      expect(credentials.documentationUrl).toBe('https://deep-ocr.com');
    });

    it('should have correct icon', () => {
      expect(credentials.icon).toBe('file:../nodes/DeepOcr/deepocr.svg');
    });

    it('should have apiKey property', () => {
      const apiKeyProperty = credentials.properties.find((p) => p.name === 'apiKey');
      expect(apiKeyProperty).toBeDefined();
      expect(apiKeyProperty?.type).toBe('string');
      expect(apiKeyProperty?.required).toBe(true);
    });

    it('should have apiKey as password type', () => {
      const apiKeyProperty = credentials.properties.find((p) => p.name === 'apiKey');
      expect(apiKeyProperty?.typeOptions?.password).toBe(true);
    });
  });

  describe('authentication', () => {
    it('should use generic authentication type', () => {
      expect(credentials.authenticate.type).toBe('generic');
    });

    it('should set Bearer token in Authorization header', () => {
      const authProps = credentials.authenticate.properties;
      expect(authProps?.headers?.Authorization).toBe('={{"Bearer " + $credentials.apiKey}}');
    });
  });

  describe('credential test', () => {
    it('should have test request configuration', () => {
      expect(credentials.test).toBeDefined();
      expect(credentials.test.request).toBeDefined();
    });

    it('should test against health endpoint', () => {
      expect(credentials.test.request.url).toBe('/health');
      expect(credentials.test.request.method).toBe('GET');
    });

    it('should use correct base URL', () => {
      expect(credentials.test.request.baseURL).toBe('https://api.deep-ocr.com');
    });
  });
});
