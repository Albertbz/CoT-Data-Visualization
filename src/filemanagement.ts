import { writeFileSync, readFileSync, readdirSync } from 'fs';

/**
 * Save parsed data to a local JSON file.
 * 
 * @param data The data to save.
 * @param filePath The path of the file to save to.
 */
export function saveParsedDataToFile<T>(data: T, filePath: string): void {
  const jsonData = JSON.stringify(data, null, 2);
  writeFileSync(filePath, jsonData, 'utf-8');
}

/**
 * Load data from a local JSON file.
 * 
 * @param filePath The path of the file to load from.
 * @returns The parsed data.
 */
export function loadDataFromFile<T>(filePath: string): T {
  const fileContent = readFileSync(filePath, 'utf-8');
  return JSON.parse(fileContent) as T;
}

/**
 * Get pairs of age and house files by date.
 * 
 * @param ageFiles List of age file names.
 * @param houseFiles List of house file names.
 * @returns List of paired files with their corresponding date.
 */
export function getPairedFilesByDate(ageFiles: string[], houseFiles: string[]): { ageFile: string | null; houseFile: string | null; date: Date | null }[] {
  const pairedFiles: { ageFile: string; houseFile: string; date: Date | null }[] = [];
  let lastAgeFile = '';
  let lastHouseFile = '';
  let ageIndex = 0;
  let houseIndex = 0;
  // All are year 2025, at noon to avoid timezone issues.
  const YEAR = 2025;
  const NOON = "12:00:00";

  while (ageIndex < ageFiles.length || houseIndex < houseFiles.length) {
    const ageFile = ageIndex < ageFiles.length ? ageFiles[ageIndex] : null;
    const houseFile = houseIndex < houseFiles.length ? houseFiles[houseIndex] : null;

    const ageDate = ageFile ? new Date(`${ageFile.replace('.json', '')} ${YEAR} ${NOON}`) : null;
    const houseDate = houseFile ? new Date(`${houseFile.replace('.json', '')} ${YEAR} ${NOON}`) : null;

    // Advance the index for whichever date is earlier (or both if they are equal).
    if (ageDate && (!houseDate || ageDate <= houseDate)) {
      lastAgeFile = ageFile!;
      ageIndex++;
    }

    if (houseDate && (!ageDate || houseDate <= ageDate)) {
      lastHouseFile = houseFile!;
      houseIndex++;
    }

    // The dates of the last used files.
    const ageDateUsed = lastAgeFile ? new Date(`${lastAgeFile.replace('.json', '')} ${YEAR} ${NOON}`) : null;
    const houseDateUsed = lastHouseFile ? new Date(`${lastHouseFile.replace('.json', '')} ${YEAR} ${NOON}`) : null;
    // Use the later date of the two for the pair.
    const pairDate = ageDateUsed && houseDateUsed
      ? (ageDateUsed > houseDateUsed ? ageDateUsed : houseDateUsed)
      : (ageDateUsed ?? houseDateUsed);
    pairedFiles.push({ ageFile: lastAgeFile, houseFile: lastHouseFile, date: pairDate });
  }
  return pairedFiles;
}

/**
 * Read all files in a directory that match a given extension.
 * 
 * @param dirPath The path of the directory.
 * @param extension The file extension to filter by.
 * @returns List of files with the given extension.
 */
export function readFilesInDirectory(dirPath: string, extension: string): string[] {
  return readdirSync(dirPath).filter((file: string) => file.endsWith(extension));
}