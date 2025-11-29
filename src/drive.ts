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

/**
 * Given a file ID, assuming said file is a folder containing folders of months,
 * returns all day files in said month folders.
 * 
 * @param drive An authenticated Google Drive client.
 * @param folderId The ID of the folder in Google Drive.
 * @returns A promise that resolves to an array of File objects.
 */
export async function getAllDayFilesInMonthFolders(drive: drive_v3.Drive, folderId: string): Promise<drive_v3.Schema$File[]> {
  const monthFolders = await getFilesInFolder(drive, folderId, 10);
  const dayFiles: drive_v3.Schema$File[] = [];
  for (const file of monthFolders) {
    const files = await getFilesInFolder(drive, file.id!, 31);
    dayFiles.push(...files);
  }
  return dayFiles;
}

/**
 * Given a file ID, returns all revisions of that file.
 * 
 * @param drive An authenticated Google Drive client.
 * @param fileId The ID of the file in Google Drive.
 * @returns A promise that resolves to an array of Revision objects.
 */
export async function getFileRevisions(drive: drive_v3.Drive, fileId: string): Promise<drive_v3.Schema$Revision[]> {
  const revisions = [];
  
  // Start by getting the first page of revisions
  const result = await drive.revisions.list({
    fileId: fileId,
    fields: 'revisions(id, modifiedTime, lastModifyingUser(displayName, emailAddress))',
  });
  // Add the revisions from the first page
  revisions.push(...(result.data.revisions ?? []));
  
  // If there are more pages, keep fetching them
  while (result.data.nextPageToken) {
    const nextPage = await drive.revisions.list({
      fileId: fileId,
      pageToken: result.data.nextPageToken,
      fields: 'revisions(id, modifiedTime, lastModifyingUser(displayName, emailAddress))',
    });
    revisions.push(...(nextPage.data.revisions ?? []));
    result.data.nextPageToken = nextPage.data.nextPageToken;
  }

  return revisions;
}