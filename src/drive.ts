import { drive_v3, google, Auth } from 'googleapis';


/**
 * Given an authenticated client, returns a Google Drive client.
 */
export async function getDriveClient(auth: Auth.JWT): Promise<drive_v3.Drive> {
  return google.drive({ version: 'v3', auth });
}

/**
 * Lists the names and IDs of up to 10 files.
 */
export async function listFiles(drive: drive_v3.Drive): Promise<void> {
  // Get the list of files.
  const result = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = result.data.files;
  if (!files || files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log('Files:');
  // Print the name and ID of each file.
  files.forEach((file) => {
    console.log(`${file.name} (${file.id})`);
  });
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