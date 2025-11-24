import { getFilesInFolder, getDriveClient } from './drive';
import { drive_v3 } from 'googleapis/build/src/apis/drive/v3';
import { getAuthenticatedClient } from './auth';

async function main(): Promise<void> {
  const jwt = await getAuthenticatedClient('service-account-key.json', ['https://www.googleapis.com/auth/drive']);

  const drive = await getDriveClient(jwt);

  const monthFolders = await getFilesInFolder(drive, '1rO45yQt6zjuJMpUTtscV9-u6O6KPYuU6', 10);

  const dayFiles: drive_v3.Schema$File[] = [];
  for (const file of monthFolders) {
    const files = await getFilesInFolder(drive, file.id!, 31);
    dayFiles.push(...files);
  }


  console.log('Day files:');
  dayFiles.forEach((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

main();