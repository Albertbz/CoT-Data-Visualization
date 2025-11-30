import { mergeAgeAndHouseData } from './dataprocessing';
// import { getAuthenticatedClient } from './auth';
// import { Auth } from 'googleapis';
import { getPairedFilesByDate, loadDataFromFile, readFilesInDirectory, saveParsedDataToFile } from './filemanagement';

async function main(): Promise<void> {

  // const jwt: Auth.JWT = await getAuthenticatedClient('service-account-key.json', ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets.readonly']);

  // Get all files in the /merged_data/ folder.
  const mergedDataFiles = readFilesInDirectory('./merged_data/', '.json');

  // Combine all merged data files into a single array, adding a "Date" field to each entry.
  let allMergedData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Social Class": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number; "Date": string }[] = [];
  for (const fileName of mergedDataFiles) {
    const filePath = `./merged_data/${fileName}`;
    let fileData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Social Class": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number; "Date": string }[] = [];
    try {
      fileData = loadDataFromFile<typeof fileData>(filePath);
    } catch (error) {
      console.warn(`Warning: Could not load merged data from file ${filePath}. Skipping this file. Error: ${(error as Error).message}`);
      continue;
    }

    // Extract date from filename.
    const dateParts = fileName.replace('.json', '').split('-');
    let fileDate: Date | null = null;
    if (dateParts.length === 3) {
      const month = parseInt(dateParts[0], 10);
      const day = parseInt(dateParts[1], 10);
      const year = parseInt(dateParts[2], 10);
      fileDate = new Date(year, month - 1, day);
    }

    // Add "Date" field to each entry.
    for (const entry of fileData) {
      entry.Date = fileDate!.toISOString().split('T')[0];
      allMergedData.push(entry);
    }
  }

  // Save the combined data to a new JSON file.
  const combinedFilePath = './merged_data/all_merged_data.json';
  saveParsedDataToFile(allMergedData, combinedFilePath);
  console.log(`Saved combined merged data to ${combinedFilePath}`);
}

main();


/**
 * Read all age and house files, merge their data, and save the merged data
 * to the /merged_data/ folder.
 * @returns A promise that resolves when the process is complete.
 */
export async function mergeAllDataFiles(): Promise<void> {
  // Get all JSON files in the /parsed_data/age/ and /parsed_data/house/ folders.
  let ageFiles = readFilesInDirectory('./parsed_data/age/', '.json');
  let houseFiles = readFilesInDirectory('./parsed_data/house/', '.json');

  // Sort the files by the date in the filename (Month Day).
  function sortByDate(files: string[]): string[] {
    return files.sort((a, b) => {
      const dateA = new Date(a.replace('.json', ''));
      const dateB = new Date(b.replace('.json', ''));
      return dateA.getTime() - dateB.getTime();
    });
  }
  ageFiles = sortByDate(ageFiles);
  houseFiles = sortByDate(houseFiles);

  // Get paired files by date.
  const pairedFiles = getPairedFilesByDate(ageFiles, houseFiles);

  // Merge the data from each pair of files.
  for (const pair of pairedFiles) {
    console.log(`Merging data for date: ${pair.date ? pair.date.toDateString() : 'N/A'}`);
    const ageFilePath = `./parsed_data/age/${pair.ageFile}`;
    const houseFilePath = `./parsed_data/house/${pair.houseFile}`;

    let ageData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[] = [];
    let houseData: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[] = [];
    try {
      ageData = loadDataFromFile<{ "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[]>(ageFilePath);
    }
    catch (error) {
      console.warn(`Warning: Could not load age data from file ${ageFilePath}. Using empty data. Error: ${(error as Error).message}`);
    }
    try {
      houseData = loadDataFromFile<{ "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[]>(houseFilePath);
    } catch (error) {
      console.warn(`Warning: Could not load house data from file ${houseFilePath}. Using empty data. Error: ${(error as Error).message}`);
    }

    const mergedData = mergeAgeAndHouseData(ageData, houseData);

    // Save the merged data to a new JSON file.
    const mergedFileName = pair.date ? `${pair.date.getMonth() + 1}-${pair.date.getDate()}-${pair.date.getFullYear()}` : 'merged_data';
    const mergedFilePath = `./merged_data/${mergedFileName}.json`;
    saveParsedDataToFile(mergedData, mergedFilePath);
    console.log(`Saved merged data to ${mergedFilePath}`);
  }
}
