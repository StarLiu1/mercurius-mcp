// src/utils/vsacErrorHandler.js

export class VSACError extends Error {
    constructor(message, code, statusCode = null) {
      super(message);
      this.name = 'VSACError';
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  
  export function handleVsacError(error, valueSetId) {
    console.error(`VSAC Error for ${valueSetId}:`, error);
  
    // Handle different types of errors
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
  
      switch (status) {
        case 401:
          throw new VSACError(
            'VSAC authentication failed. Check your UMLS username and password.',
            'AUTH_FAILED',
            401
          );
        
        case 403:
          throw new VSACError(
            'VSAC access forbidden. Ensure your UMLS account has VSAC access enabled.',
            'ACCESS_FORBIDDEN',
            403
          );
        
        case 404:
          throw new VSACError(
            `Value set not found: ${valueSetId}. Verify the OID is correct.`,
            'VALUESET_NOT_FOUND',
            404
          );
        
        case 429:
          throw new VSACError(
            'VSAC rate limit exceeded. Please wait before retrying.',
            'RATE_LIMIT',
            429
          );
        
        case 500:
        case 502:
        case 503:
          throw new VSACError(
            'VSAC service temporarily unavailable. Please try again later.',
            'SERVICE_UNAVAILABLE',
            status
          );
        
        default:
          throw new VSACError(
            `VSAC API error (${status}): ${data || error.message}`,
            'API_ERROR',
            status
          );
      }
    }
  
    // Handle network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new VSACError(
        'Unable to connect to VSAC. Check your internet connection.',
        'NETWORK_ERROR'
      );
    }
  
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new VSACError(
        'VSAC request timed out. The service may be slow, try again.',
        'TIMEOUT'
      );
    }
  
    // Handle XML parsing errors
    if (error.message.includes('XML') || error.message.includes('parse')) {
      throw new VSACError(
        'Invalid response from VSAC. The value set may be empty or malformed.',
        'INVALID_RESPONSE'
      );
    }
  
    // Generic error fallback
    throw new VSACError(
      `Unexpected VSAC error: ${error.message}`,
      'UNKNOWN_ERROR'
    );
  }
  
  export function getVsacErrorGuidance(error) {
    const guidance = {
      AUTH_FAILED: [
        'Verify your UMLS username and password',
        'Check if your UMLS account is active',
        'Try logging into https://uts.nlm.nih.gov/uts/ manually'
      ],
      ACCESS_FORBIDDEN: [
        'Log into your UMLS account at https://uts.nlm.nih.gov/uts/',
        'Navigate to "Profile" and ensure VSAC access is enabled',
        'Contact UMLS support if access issues persist'
      ],
      VALUESET_NOT_FOUND: [
        'Verify the ValueSet OID format (e.g., 2.16.840.1.113883.x.x.x)',
        'Check if the ValueSet exists in VSAC web interface',
        'Try searching for the ValueSet by name in VSAC'
      ],
      RATE_LIMIT: [
        'Wait 60 seconds before retrying',
        'Reduce the number of concurrent requests',
        'Consider batching multiple ValueSet requests'
      ],
      SERVICE_UNAVAILABLE: [
        'Wait a few minutes and retry',
        'Check VSAC service status',
        'Try during off-peak hours'
      ],
      NETWORK_ERROR: [
        'Check your internet connection',
        'Verify firewall/proxy settings allow HTTPS to vsac.nlm.nih.gov',
        'Try from a different network'
      ],
      TIMEOUT: [
        'Retry with a smaller batch size',
        'Try during off-peak hours when VSAC is less busy',
        'Check your network connection speed'
      ],
      INVALID_RESPONSE: [
        'The ValueSet may be empty or contain malformed data',
        'Try accessing the ValueSet through VSAC web interface',
        'Report the issue if the ValueSet appears valid in VSAC'
      ]
    };
  
    return guidance[error.code] || [
      'Check the error message for specific details',
      'Verify your VSAC credentials and network connection',
      'Try again after a short wait'
    ];
  }