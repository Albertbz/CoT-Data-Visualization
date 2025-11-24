import { google, Auth } from 'googleapis';

/**
 * Get an authenticated Google API client using a service account.
 * @param keyFilePath The path to the service account key file.
 * @param scopes The scopes required for the API access.
 * @returns A promise that resolves to an authenticated JWT client.
 */
export async function getAuthenticatedClient(keyFilePath: string, scopes: string | string[]): Promise<Auth.JWT> {
  const client = new google.auth.JWT({
    keyFile: keyFilePath,
    scopes: scopes,
  });

  await client.authorize();
  return client;
}