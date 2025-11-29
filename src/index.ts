import { getDriveClient, getAllDayFilesInMonthFolders } from './drive';
import { getSheetsClient, getAllSheetData, getSheetData } from './sheets';
import { parseHouseData, cleanHouseData, cleanAgeData, parseAgeData } from './dataprocessing';
import { saveParsedHouseDataToFile, saveParsedAgeDataToFile } from './filemanagement';
import { getAuthenticatedClient } from './auth';
import { Auth } from 'googleapis';

async function main(): Promise<void> {

  const jwt: Auth.JWT = await getAuthenticatedClient('service-account-key.json', ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets.readonly']);
  await processAgeSheets(jwt, '1NW8NfeSp1EjIPv42T8s21a3BBSVYufx1');
  await processGreatHousesCitizensSheets(jwt, '1ym37u6_V0fipdCjhxMRgiD7GH2C-9gML');
}

main();

/**
 * Given the ID of a Google Drive folder containing Age sheets, process and save
 * all sheets in all files in the folder, parsing them into JSON files.
 * 
 * @param jwt An authenticated JWT client.
 * @param folderId The ID of the Google Drive folder.
 */
export async function processAgeSheets(jwt: Auth.JWT, folderId: string): Promise<void> {
  const drive = getDriveClient(jwt);
  
  const dayFiles = await getAllDayFilesInMonthFolders(drive, folderId);

  const sheets = getSheetsClient(jwt);
  for (const dayFile of dayFiles) {
    console.log('Processing file:', dayFile.name, `(${dayFile.id})`);
    const data = await getSheetData(sheets, dayFile.id!, 'Age');
    const cleanedData = cleanAgeData(data);
    const parsedData = parseAgeData(cleanedData);
    console.log(`Parsed data from file: ${dayFile.name}`);
    // Uncomment the following line to see the parsed data
    // console.log(JSON.stringify(parsedData, null, 2));
    const filename = `${dayFile.name?.split('- ')[1].split(',')[0]}.json`;
    const savePath = `parsed_data/age/${filename}`;
    saveParsedAgeDataToFile(parsedData, savePath);
  }
}
 

/**
 * Given the ID of a Google Drive folder containing Great Houses Citizens
 * sheets, process and save all sheets in all files in the folder, parsing them
 * into JSON files.
 * 
 * @param jwt An authenticated JWT client.
 * @param folderId The ID of the Google Drive folder.
 */
export async function processGreatHousesCitizensSheets(jwt: Auth.JWT, folderId: string): Promise<void> {
  const drive = getDriveClient(jwt);
  
  const dayFiles = await getAllDayFilesInMonthFolders(drive, folderId);

  const sheets = getSheetsClient(jwt);
  for (const dayFile of dayFiles) {
    console.log('Processing file:', dayFile.name, `(${dayFile.id})`);
    const data = await getAllSheetData(sheets, dayFile.id!);
    const cleanedData = cleanHouseData(data);
    const parsedData = parseHouseData(cleanedData);
    console.log(`Parsed data from file: ${dayFile.name}`);
    // Uncomment the following line to see the parsed data
    // console.log(JSON.stringify(parsedData, null, 2));
    const filename = `${dayFile.name?.split('- ')[1].split(',')[0]}.json`;
    const savePath = `parsed_data/house/${filename}`;
    saveParsedHouseDataToFile(parsedData, savePath);
  }
}