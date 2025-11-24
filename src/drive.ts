import { drive_v3, google, Auth } from 'googleapis';


/**
 * Given an authenticated client, returns a Google Drive client.
 * 
 * @param auth An authenticated JWT client.
 * @returns A Google Drive client.
 */
export function getDriveClient(auth: Auth.JWT): drive_v3.Drive {
  return google.drive({ version: 'v3', auth });
}

/**
 * Given a folder ID, returns the list of files in said folder.
 * 
 * @param drive An authenticated Google Drive client.
 * @param folderId The ID of the folder in Google Drive.
 * @param pageSize The maximum number of files to return.
 * @returns A promise that resolves to an array of File objects.
 */
export async function getFilesInFolder(drive: drive_v3.Drive, folderId: string, pageSize: number): Promise<drive_v3.Schema$File[]> {
  const result = await drive.files.list({
    q: `'${folderId}' in parents`,
    pageSize: pageSize,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = result.data.files ?? [];

  return files;
}