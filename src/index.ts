import { getFilesInFolder, getDriveClient } from './drive';
import { getSheetsClient, getAllSheetData } from './sheets';
import { parseSheetData, cleanSheetData } from './dataprocessing';
import { saveParsedDataToFile } from './filemanagement';
import { drive_v3 } from 'googleapis/build/src/apis/drive/v3';
import { getAuthenticatedClient } from './auth';

async function main(): Promise<void> {
  const jwt = await getAuthenticatedClient('service-account-key.json', ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets.readonly']);

  const drive = getDriveClient(jwt);

  const monthFolders = await getFilesInFolder(drive, '1rO45yQt6zjuJMpUTtscV9-u6O6KPYuU6', 10);

  const dayFiles: drive_v3.Schema$File[] = [];
  for (const file of monthFolders) {
    const files = await getFilesInFolder(drive, file.id!, 31);
    dayFiles.push(...files);
  }

  const sheets = getSheetsClient(jwt);
  for (const dayFile of dayFiles) {
    console.log('Processing file:', dayFile.name, `(${dayFile.id})`);
    const data = await getAllSheetData(sheets, dayFile.id!);
    const cleanedData = cleanSheetData(data);
    const parsedData = parseSheetData(cleanedData);
    console.log(`Parsed data from file: ${dayFile.name}`);
    // Uncomment the following line to see the parsed data
    console.log(JSON.stringify(parsedData, null, 2));
    const filename = `${dayFile.name?.split('- ')[1].split(',')[0]}.json`;
    const savePath = `parsed_data/${filename}`;
    saveParsedDataToFile(parsedData, savePath);
  }
}

main();