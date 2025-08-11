// Yorkie API service functions
const YORKIE_API_BASE = import.meta.env.VITE_YORKIE_API_ADDR;

interface YorkieDocument {
  id: string;
  key: string;
  project_name: string;
  created_at: string;
  updated_at: string;
  root: any;
  presences: any;
}

interface GetDocumentsResponse {
  documents: YorkieDocument[];
}

export class YorkieApiService {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  /**
   * Get documents with presence information
   * @param projectName - Project name
   * @param includePresences - Whether to include presence information
   * @returns Promise with documents and their presences
   */
  async getDocuments(projectName: string, documentKeys: string[], includePresences: boolean = true): Promise<YorkieDocument[]> {
    try {
      const response = await fetch(`${YORKIE_API_BASE}/yorkie.v1.AdminService/GetDocuments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.secretKey,
        },
        body: JSON.stringify({
          project_name: projectName,
          document_keys: documentKeys,
          include_presences: includePresences,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: GetDocumentsResponse = await response.json();
      return data.documents || [];
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      throw error;
    }
  }

  /**
   * Get documents for watch-this-page example
   * @returns Promise with watch-this-page documents
   */
  async getWatchThisPageDocuments(documentKeys: string[]): Promise<YorkieDocument[]> {
    return await this.getDocuments(import.meta.env.VITE_YORKIE_PROJECT_NAME || 'default', documentKeys, true);
  }
}

// Create a singleton instance
export const yorkieApi = new YorkieApiService(import.meta.env.VITE_YORKIE_SECRET_KEY || ''); 