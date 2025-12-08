import { Auth, sheets_v4 } from 'googleapis';
import { getAllDayFilesInMonthFolders, getDriveClient } from './drive';
import { getAllSheetData, getSheetData, getSheetsClient } from './sheets';
import { saveParsedDataToFile } from './filemanagement';

/**
 * Given a 3D array of cells from multiple sheets, parses the data into
 * an array of objects for easier processing. The first row of each sheet is assumed
 * to be the header row, and subsequent rows are data rows.
 * 
 * @param allSheetData A 3D array where the first dimension is the sheet name,
 * the second dimension are the rows, and the third dimension are the cells.
 * @returns An array of objects of all characters.
 */
export function parseHouseData(allSheetData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][] }): { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[] {
  const parsedData: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[] = [];

  for (const sheetName in allSheetData) {
    const sheetData = allSheetData[sheetName];
    if (sheetData.length === 0) {
      continue;
    }

    const headers = sheetData[0].map(cell => cell.cellValue) as (string | number | boolean)[];
    const rows = sheetData.slice(1);

    const parsedRows = rows.map((row) => {
      const rowObject: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string } = {
        "Social Class": '',
        "House": '',
        "Role": '',
        "Character Name": '',
        "VS Username": '',
        "Discord Username": '',
        "Timezone": '',
        "Comments": ''
      };
      headers.forEach((header, index) => {
        const key = String(header) as keyof typeof rowObject;
        if (key in rowObject) {
          rowObject[key] = row[index] ? String(row[index].cellValue) : '';
        }
      });
      rowObject['House'] = sheetName;
      return rowObject;
    });

    // Filter out empty rows (where Character Name is empty)
    const nonEmptyParsedRows = parsedRows.filter(row => row['Character Name'] !== '');

    // Also delete any duplicate entries based on Character Name
    const uniqueParsedRows: { [characterName: string]: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string } } = {};
    for (const row of nonEmptyParsedRows) {
      uniqueParsedRows[row['Character Name']] = row;
    }

    const deduplicatedParsedRows = Object.values(uniqueParsedRows);
    parsedData.push(...deduplicatedParsedRows);
  }

      return parsedData;
    }

/**
 * Given a 3D array of rows of cells from multiple sheets, makes sure that the
 * proper format is followed, i.e., that each sheet has the same headers. If not,
 * it determines why this is the case and attempts to fix it.
 * 
 * @param allSheetData A 3D array where the first dimension is the sheet name,
 * the second dimension is the row, and the third dimension are the cells.
 * @returns A cleaned version of the input data.
 */
export function cleanHouseData(allSheetData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][] }): { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][] } {
  // First, ignore any sheet named 'Overview'
  delete allSheetData['Overview'];

  // Then, check whether all sheets have the proper headers, these being:
  // ['Social Class', 'Role', 'Character Name', 'VS Username', 'Discord Username', 'Timezone', 'Comments']
  const expectedHeaders = ['Social Class', 'Role', 'Character Name', 'VS Username', 'Discord Username', 'Timezone', 'Comments'];

  for (const sheetName in allSheetData) {
    const sheetData = allSheetData[sheetName];
    if (sheetData.length === 0) {
      continue;
    }

    const headers = sheetData[0].map(cell => cell.cellValue);
    const headerMismatch = expectedHeaders.some((expectedHeader, index) => String(headers[index]) !== expectedHeader);

    if (headerMismatch) {
      // If they contain the following headers instead, we can remap them:
      // ['Social Class', 'Role', 'Character Name', 'IGN', 'Discord', 'Timezone', 'Comments'] -> ['Social Class', 'Role', 'Character Name', 'VS Username', 'Discord Username', 'Timezone', 'Comments']
      const alternativeHeaders = ['Social Class', 'Role', 'Character Name', 'IGN', 'Discord', 'Timezone', 'Comments'];
      const isAlternativeFormat = alternativeHeaders.every((altHeader, index) => String(headers[index]) === altHeader);

      if (isAlternativeFormat) {
        console.log(`Remapping alternative headers in sheet "${sheetName}" to expected headers.`);
        // Remap the headers (we do not care about formatting in this case)
        sheetData[0] = expectedHeaders.map(header => ({ cellValue: header, cellFormat: {} }));
        allSheetData[sheetName] = sheetData;
        continue;
      }


      // If they are empty, means that the sheet is following the old format.
      // As such, these must be handled differently.
      if (headers.every(header => header === '')) {
        console.log(`Cleaning old format in sheet "${sheetName}".`);
        // Old format detected, need to transform the data
        // First, find the rows that contain the 'Notable' characters and the
        // rows that contain the 'Commoner' characters. This is done by finding
        // the rows where there is a cell that contains 'Notables' or 'Commoners'.
        // There will then be a table below each of these rows that contains
        // the actual data. As such, we can split the sheet into two tables,
        // one for Notables and one for Commoners, and then merge them back
        // together after adding the 'Social Class' column.
        // These tables will have the following headers:
        // ['Role', 'Character Name', 'IGN', 'Discord', 'Comments'] or
        // ['Role', 'Character Name', 'IGN', 'Discord', 'Timezone', 'Comments']
        // These tables will then be transformed to have the expected headers,
        // with the 'Social Class' column added and the 'Timezone' column added
        // as well if not present.

        // First, remove the first column which is empty
        for (let i = 0; i < sheetData.length; i++) {
          sheetData[i] = sheetData[i].slice(1);
        }

        // Then, find the indices of the notable and commoner sections
        const notableIndex = sheetData.findIndex(row => row.some(cell => String(cell.cellValue).toLowerCase().includes('notables')));
        const commonerIndex = sheetData.findIndex(row => row.some(cell => String(cell.cellValue).toLowerCase().includes('commoners')));

        // Now, extract the tables and add the 'Social Class' column
        const tables: { socialClass: string, startIndex: number, endIndex: number }[] = [];
        if (notableIndex !== -1) {
          const endIndex = commonerIndex !== -1 ? commonerIndex : sheetData.length;
          tables.push({ socialClass: 'Notable', startIndex: notableIndex + 1, endIndex });
        }
        if (commonerIndex !== -1) {
          tables.push({ socialClass: 'Commoner', startIndex: commonerIndex + 1, endIndex: sheetData.length });
        }

        const newSheetData: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][] = [];
        newSheetData.push(expectedHeaders.map(header => ({ cellValue: header, cellFormat: {} }))); // Add headers

        // Get the headers of the old format by looking at the second row of the
        // first table
        const oldFormatHeaders = sheetData[tables[0].startIndex - 2].map(cell => String(cell.cellValue));
        const hasTimezone = oldFormatHeaders.includes('Timezone');

        // Also remove the first (empty) row and header rows from the sheet data
        for (const table of tables) {
          sheetData.splice(table.startIndex - 2, 2);
          table.endIndex -= 2;
        }

        // Process each table and add rows to newSheetData
        for (const table of tables) {
          const tableData = sheetData.slice(table.startIndex, table.endIndex);
          for (const row of tableData) {
            // Skip empty rows
            if (row.every(cell => cell.cellValue === '')) {
              continue;
            }

            // Get the background color of the first cell to determine whether
            // the character is a noble or ruler, and as such should have that
            // set as the social class.
            // R=0.9882353 G=0.8980392 B=0.8039216 is 'Ruler' social class
            // R=1 G=0.9764706 B=0.8862745 is 'Noble' social class
            let socialClass = table.socialClass;
            const bgColor = row[0].cellFormat?.backgroundColor;
            if (bgColor) {
              const r = bgColor.red ?? 0;
              const g = bgColor.green ?? 0;
              const b = bgColor.blue ?? 0;
              if (Math.abs(r - 0.9882353) < 0.01 && Math.abs(g - 0.8980392) < 0.01 && Math.abs(b - 0.8039216) < 0.01) {
                socialClass = 'Ruler';
              } else if (Math.abs(r - 1) < 0.01 && Math.abs(g - 0.9764706) < 0.01 && Math.abs(b - 0.8862745) < 0.01) {
                socialClass = 'Noble';
              }
            }

            const newRow: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[] = [];
            newRow.push({ cellValue: socialClass, cellFormat: {} }); // Social Class
            newRow.push({ cellValue: row[0] ? row[0].cellValue : '', cellFormat: row[0]?.cellFormat }); // Role
            newRow.push({ cellValue: row[1] ? row[1].cellValue : '', cellFormat: row[1]?.cellFormat }); // Character Name
            newRow.push({ cellValue: row[2] ? row[2].cellValue : '', cellFormat: row[2]?.cellFormat }); // VS Username (IGN)
            newRow.push({ cellValue: row[3] ? row[3].cellValue : '', cellFormat: row[3]?.cellFormat }); // Discord Username (Discord)
            // Timezone might be missing in some old formats
            if (!hasTimezone) {
              newRow.push({ cellValue: '', cellFormat: {} }); // Timezone empty
              newRow.push({ cellValue: row[4] ? row[4].cellValue : '', cellFormat: row[4]?.cellFormat }); // Comments
            } else {
              newRow.push({ cellValue: row[4] ? row[4].cellValue : '', cellFormat: row[4]?.cellFormat }); // Timezone
              newRow.push({ cellValue: row[5] ? row[5].cellValue : '', cellFormat: row[5]?.cellFormat }); // Comments
            }

            newSheetData.push(newRow);
          }
        }
        allSheetData[sheetName] = newSheetData;
      }
    }
  }

  return allSheetData;
}

/**
 * Given a 2D array of character age data from a sheet, cleans the data by
 * looking at the headers and ensuring that they are as expected. If not, attempts
 * to fix the data by remapping or transforming it.
 * 
 * @param sheetData A 2D array where the first dimension is the row and the
 * second dimension is the column.
 * @returns A cleaned version of the input data.
 */
export function cleanAgeData(sheetData: (string | number | boolean)[][]): (string | number | boolean)[][] {
  // First, remove the first column as it is always empty
  for (let i = 0; i < sheetData.length; i++) {
    sheetData[i] = sheetData[i].slice(1);
  }

  // Also, remove the first 5 rows, as they are metadata
  sheetData = sheetData.slice(5);

  // Expected headers:
  // ['Discord Username', 'VS Username', 'Character Name', 'Affiliation', 'PvE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8']
  const expectedHeaders = ['Discord Username', 'VS Username', 'Character Name', 'Affiliation', 'PvE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8'];
  if (sheetData.length === 0) {
    return sheetData;
  }

  // Headers are in the 6th row (index 0 after slicing)
  const headers = sheetData[0];
  const headerMismatch = expectedHeaders.some((expectedHeader, index) => String(headers[index]) !== expectedHeader);

  if (headerMismatch) {
    // If they contain one of the following headers instead, we can remap them:
    // ['Discord Username', 'VS Username', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8']
    // or
    // ['Player Name', 'Ingame Name', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8']
    // or
    // ['Player Name', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Birth', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7']
    // or
    // ['Player Name', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7']
    const alternativeHeadersList = [
      ['Discord Username', 'VS Username', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8'],
      ['Player Name', 'Ingame Name', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8'],
      ['Player Name', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Birth', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7'],
      ['Player Name', 'Character Name', 'Affiliation', 'PVE Deaths', 'Year of Maturity', 'Current Age', 'Year 4', 'Year 5', 'Year 6', 'Year 7']
    ];

    let isAlternativeFormat = false;
    let matchIndex = -1;
    for (const alternativeHeaders of alternativeHeadersList) {
      const match = alternativeHeaders.every((altHeader, index) => String(headers[index]) === altHeader);
      if (match) {
        isAlternativeFormat = true;
        matchIndex = alternativeHeadersList.indexOf(alternativeHeaders);
        break;
      }
    }


    if (isAlternativeFormat) {
      console.log(`Remapping alternative headers in Age sheet to expected headers.`);
      // Remap the headers (we do not care about formatting in this case)
      if (matchIndex === 2 || matchIndex === 3) {
        // Special case: need to add missing headers
        // Must shift columns to the right and add empty columns for missing data
        const newSheetData: (string | number | boolean)[][] = [];
        newSheetData.push(expectedHeaders);
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          const newRow: (string | number | boolean)[] = [];
          newRow.push(row[0]); // Discord Username (Player Name)
          newRow.push(''); // VS Username (missing)
          newRow.push(row[1]); // Character Name
          newRow.push(row[2]); // Affiliation
          newRow.push(row[3]); // PvE Deaths
          newRow.push(row[4]); // Year of Maturity (Year of Birth)
          newRow.push(row[5]); // Current Age
          newRow.push(row[6]); // Year 4
          newRow.push(row[7]); // Year 5
          newRow.push(row[8]); // Year 6
          newRow.push(row[9]); // Year 7
          newSheetData.push(newRow);
        }
        sheetData = newSheetData;
      }
      else {
        // Simply renaming of headers, so just replace them
        sheetData[0] = expectedHeaders.map(header => header);
      }
    } else {
      console.warn('Unrecognized header format:', headers);
    }
  }
  else {
    console.log('Headers match expected format.');
  }

  return sheetData;
}

/**
 * Given cleaned data from Age sheets, parses it into an array of objects for easier processing.
 * 
 * @param sheetData A 2D array where the first dimension is the row and the second dimension is the column.
 * @returns An array of objects of all characters.
 */
export function parseAgeData(sheetData: (string | number | boolean)[][]): { "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[] {
  const parsedData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[] = [];

  if (sheetData.length === 0) {
    return parsedData;
  }

  const rows = sheetData.slice(1);

  for (const row of rows) {
    // Skip empty rows
    if (row.every(cell => cell === '')) {
      continue;
    }

    const rowObject: { "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number } = {
      "Discord Username": String(row[0]),
      "VS Username": String(row[1]),
      "Character Name": String(row[2]),
      "Affiliation": String(row[3]),
      "PvE Deaths": Number(row[4]),
      "Year of Maturity": Number(row[5]),
      "Current Age": Number(row[6]),
      "Year 4": Number(row[7]),
      "Year 5": Number(row[8]),
      "Year 6": Number(row[9]),
      "Year 7": Number(row[10]),
      "Year 8": Number(row[11])
    };

    // Skip rows where Character Name is empty
    if (rowObject['Character Name'] === '') {
      continue;
    }

    parsedData.push(rowObject);
  }

  return parsedData;
}

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
    saveParsedDataToFile(parsedData, savePath);
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
    saveParsedDataToFile(parsedData, savePath);
  }
}


/**
 * Given parsed age and house data, merges them based on character names.
 * 
 * @param ageData The parsed age data.
 * @param houseData The parsed house data.
 * @returns An array of merged character data.
 */
export function mergeAgeAndHouseData(
  ageData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[],
  houseData: { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[]
): { "Discord Username": string; "VS Username": string; "Character Name": string; "Social Class": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[] {
  const mergedData: { "Discord Username": string; "VS Username": string; "Character Name": string; "Social Class": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number }[] = [];

  // Strict player-first matching helpers
  const normalize = (s: string | undefined) => (s || '').toString().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const firstName = (s: string | undefined) => normalize(s).split(' ')[0] || '';

  function levenshtein(a: string, b: string) {
    const A = a.split('');
    const B = b.split('');
    const m = A.length;
    const n = B.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = A[i - 1] === B[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  // Track which house entries we've consumed
  const usedHouse = new Set<number>();

  for (const ageEntry of ageData) {
    const characterName = ageEntry['Character Name'];

    // Player-first matching: require both VS and Discord usernames to match
    // (same player), then require the first name of the character to match.
    let bestIdx = -1;
    for (let i = 0; i < houseData.length; i++) {
      if (usedHouse.has(i)) continue;
      const h = houseData[i];
      const vsA = (ageEntry['VS Username'] || '').toString().toLowerCase();
      const vsH = (h['VS Username'] || '').toString().toLowerCase();
      const dcA = (ageEntry['Discord Username'] || '').toString().toLowerCase();
      const dcH = (h['Discord Username'] || '').toString().toLowerCase();

      // Only consider it the same player if both usernames match
      if (vsA && vsH && dcA && dcH && vsA === vsH && dcA === dcH) {
        const fnA = firstName(ageEntry['Character Name']);
        const fnH = firstName(h['Character Name']);
        // Accept if first-name matches
        if (fnA && fnH && fnA === fnH) {
          bestIdx = i;
          break;
        }

        // Otherwise allow fuzzy matching on the full normalized name
        const ageName = normalize(ageEntry['Character Name']);
        const houseName = normalize(h['Character Name']);
        const dist = levenshtein(ageName, houseName);
        const maxLen = Math.max(ageName.length, houseName.length) || 1;
        const similarity = 1 - dist / maxLen; // 0..1
        const SIMILARITY_THRESHOLD = 0.6;
        if (similarity >= SIMILARITY_THRESHOLD) {
          bestIdx = i;
          break;
        }
        // If similarity too low, continue searching
      }
    }

    if (bestIdx !== -1) {
      const houseEntry = houseData[bestIdx];
      usedHouse.add(bestIdx);
      const mergedEntry = {
        "Discord Username": ageEntry['Discord Username'],
        "VS Username": ageEntry['VS Username'],
        "Character Name": characterName,
        "Social Class": houseEntry['Social Class'],
        "Affiliation": ageEntry['Affiliation'],
        "PvE Deaths": ageEntry['PvE Deaths'],
        "Year of Maturity": ageEntry['Year of Maturity'],
        "Current Age": ageEntry['Current Age'],
        "Year 4": ageEntry['Year 4'],
        "Year 5": ageEntry['Year 5'],
        "Year 6": ageEntry['Year 6'],
        "Year 7": ageEntry['Year 7'],
        "Year 8": ageEntry['Year 8']
      };
      mergedData.push(mergedEntry);
    } else {
      const mergedEntry = {
        "Discord Username": ageEntry['Discord Username'],
        "VS Username": ageEntry['VS Username'],
        "Character Name": characterName,
        "Social Class": 'Commoner',
        "Affiliation": ageEntry['Affiliation'],
        "PvE Deaths": ageEntry['PvE Deaths'],
        "Year of Maturity": ageEntry['Year of Maturity'],
        "Current Age": ageEntry['Current Age'],
        "Year 4": ageEntry['Year 4'],
        "Year 5": ageEntry['Year 5'],
        "Year 6": ageEntry['Year 6'],
        "Year 7": ageEntry['Year 7'],
        "Year 8": ageEntry['Year 8']
      };
      mergedData.push(mergedEntry);
    }
  }

  // Add any remaining house entries that were not matched
  for (let i = 0; i < houseData.length; i++) {
    if (usedHouse.has(i)) continue;
    const houseEntry = houseData[i];
    const mergedEntry = {
      "Discord Username": houseEntry['Discord Username'],
      "VS Username": houseEntry['VS Username'],
      "Character Name": houseEntry['Character Name'],
      "Social Class": houseEntry['Social Class'],
      "Affiliation": houseEntry['House'],
      "PvE Deaths": 0,
      "Year of Maturity": 0,
      "Current Age": 0,
      "Year 4": 0,
      "Year 5": 0,
      "Year 6": 0,
      "Year 7": 0,
      "Year 8": 0
    };
    mergedData.push(mergedEntry);
  }

  return mergedData;
}

export interface Segment {
  start: number;
  end: number;
  socialClass: string;
  affiliation: string;
  name: string;
  vsUsername?: string;
  discordUsername?: string;
}

export interface ProcessedCharacter {
  id: string;
  finalName: string;
  finalAffiliation: string;
  finalSocialClass: string;
  vsUsername?: string;
  discordUsername?: string;
  startYear: number;
  endYear: number;
  firstAppearanceDateStr?: string;
  lastAppearanceDateStr?: string;
  firstAppearanceIndex?: number;
  lastAppearanceIndex?: number;
  segments: Segment[];
}

type Snapshot = { "Discord Username": string; "VS Username": string; "Character Name": string; "Social Class": string; "Affiliation": string; "PvE Deaths": number; "Year of Maturity": number; "Current Age": number; "Year 4": number; "Year 5": number; "Year 6": number; "Year 7": number; "Year 8": number; "Date": string };


/**
 * Given a list of snapshotted data entries, processes them into character timelines.
 * 
 * @param data A list of snapshotted data entries.
 * @returns An array of processed character timelines.
 */
export function processCharacterTimelines(data: Snapshot[]): ProcessedCharacter[] {
  // Sort snapshots by Date ascending (stable parse; fallback to string order)
  const snapshots = data.slice().sort((a, b) => {
    const da = new Date(a.Date).getTime();
    const db = new Date(b.Date).getTime();
    if (!isFinite(da) || !isFinite(db)) return a.Date.localeCompare(b.Date);
    return da - db;
  });

  const normalize = (s: string | undefined) => (s || '').toString().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const firstName = (s: string | undefined) => normalize(s).split(' ')[0] || '';

  function levenshtein(a: string, b: string) {
    const A = a.split('');
    const B = b.split('');
    const m = A.length;
    const n = B.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = A[i - 1] === B[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  

  // (removed unused countKeyMatches helper)

  const processed: ProcessedCharacter[] = [];
  let idCounter = 1;

  // --- replicate game-month mapping from site/src/data.ts ---
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const BASE_REAL_DATE = new Date('2025-04-19');
  const BASE_GAME_YEAR = 5;
  const BASE_GAME_MONTH = 5; // May
  const RESTARTS_PER_DAY = 4;
  const RESTART_MINUTES = 6;
  const PAUSE_MINUTES_PER_DAY = RESTARTS_PER_DAY * RESTART_MINUTES; // 24
  const MINUTES_PER_DAY = 24 * 60;
  const ACTIVE_MINUTES_PER_DAY = MINUTES_PER_DAY - PAUSE_MINUTES_PER_DAY; // 1416

  function daysBetweenUTC(a: Date, b: Date) {
    const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    return Math.round((utcA - utcB) / MS_PER_DAY);
  }

  function gameMonthIndexForDate(d: Date) {
    const deltaDays = daysBetweenUTC(d, BASE_REAL_DATE);
    const baseIndex = BASE_GAME_YEAR * 12 + (BASE_GAME_MONTH - 1);
    const activeMinutes = deltaDays * ACTIVE_MINUTES_PER_DAY;
    const monthsDelta = Math.round(activeMinutes / MINUTES_PER_DAY);
    return baseIndex + monthsDelta;
  }

  const snapshotGameIndices = snapshots.map(s => {
    const d = new Date(s.Date);
    if (isFinite(d.getTime())) return gameMonthIndexForDate(d);
    // fallback: try to extract year and map to month-index at Jan
    const m = (s.Date || '').toString().match(/(20\d{2}|19\d{2})/);
    if (m) return Number(m[0]) * 12;
    return NaN;
  });

  // Precompute normalized fields for snapshots to avoid repeated work
  const snapshotsNorm = snapshots.map((s, i) => {
    const name = s['Character Name'] || '';
    const vs = s['VS Username'] || '';
    const dc = s['Discord Username'] || '';
    const nameNorm = normalize(name);
    const vsNorm = normalize(vs);
    const dcNorm = normalize(dc);
    const firstNorm = firstName(name);
    const yom = Number(s['Year of Maturity']) || 0;
    return {
      name, vs, dc, nameNorm, vsNorm, dcNorm, firstNorm, yom, dateStr: s.Date || '', gameIndex: snapshotGameIndices[i]
    };
  });

  // Maps for quick candidate lookup
  const vsMap = new Map<string, number[]>();
  const dcMap = new Map<string, number[]>();
  const firstNameMap = new Map<string, number[]>();

  const addToMap = (map: Map<string, number[]>, key: string, idx: number) => {
    if (!key) return;
    const arr = map.get(key);
    if (arr) arr.push(idx);
    else map.set(key, [idx]);
  };

  // Keep normalized meta for processed characters to avoid re-normalizing
  const processedMeta: { nameNorm: string; vsNorm: string; dcNorm: string; firstNorm: string; yom: number }[] = [];

  // Decide whether a snapshot entry and a processed character represent the same character
  function isSameCharacter(s: { nameNorm: string; vsNorm: string; dcNorm: string; firstNorm: string; yom: number }, pm: { nameNorm: string; vsNorm: string; dcNorm: string; firstNorm: string; yom: number }, _pc?: ProcessedCharacter) {
    // New logic (player-first):
    // 1) If same player (VS or Discord username equals) -> require first-name match.
    //    - If first names differ -> different characters (return false).
    //    - If first names equal -> same character (return true) (surname changes allowed).
    // 2) Otherwise, fall back to conservative fuzzy matching by name and optional metadata.

    const sameVs = s.vsNorm && pm.vsNorm && s.vsNorm === pm.vsNorm;
    const sameDc = s.dcNorm && pm.dcNorm && s.dcNorm === pm.dcNorm;
    const samePlayer = !!(sameVs || sameDc);

    // Year of maturity: if both present and different, treat as mismatch
    const bothYomPresent = (s.yom && s.yom > 0) && (pm.yom && pm.yom > 0);
    if (bothYomPresent && s.yom !== pm.yom) return false;

    // Quick name pieces
    const nameA = s.nameNorm || '';
    const nameB = pm.nameNorm || '';
    const firstA = s.firstNorm || '';
    const firstB = pm.firstNorm || '';

    if (samePlayer) {
      // If the same player but first names differ, assume different characters
      if (firstA && firstB && firstA !== firstB) return false;
      // If first name matches (or missing), consider same character (allow surname changes)
      return true;
    }
    else {
      return false;
    }

    // Fallback path (different players): require fairly strong name similarity
    if (!nameA && !nameB) return false;
    if (nameA === nameB) return true;
    const nameDist = levenshtein(nameA, nameB);
    const nameSim = 1 - nameDist / Math.max(nameA.length, nameB.length, 1);
    if (nameSim >= 0.85) return true; // high confidence by name alone

    // Accept if first-name exact match and moderate similarity otherwise
    if (firstA && firstB && firstA === firstB && nameSim >= 0.6) return true;

    // Very conservative fallback: require multiple key matches
    let keyMatches = 0;
    if (firstA && firstB && firstA === firstB) keyMatches++;
    if (s.vsNorm && pm.vsNorm && s.vsNorm === pm.vsNorm) keyMatches++;
    if (s.dcNorm && pm.dcNorm && s.dcNorm === pm.dcNorm) keyMatches++;
    if (bothYomPresent && s.yom === pm.yom) keyMatches++;
    return keyMatches >= 3;
  }

  for (let idx = 0; idx < snapshots.length; idx++) {
    const sMeta = snapshotsNorm[idx];
    const entryName = sMeta.name;
    const entryVS = sMeta.vs;
    const entryDC = sMeta.dc;
    const entryClass = snapshots[idx]['Social Class'] || '';
    const entryAff = snapshots[idx]['Affiliation'] || '';
    const entryYOM = sMeta.yom || 0;
    const entryDateStr = sMeta.dateStr || '';

    // Candidate selection using maps (fast) — union of VS, Discord, first-name buckets
    const candidates = new Set<number>();
    if (sMeta.vsNorm) {
      const arr = vsMap.get(sMeta.vsNorm);
      if (arr) arr.forEach(i => candidates.add(i));
    }
    if (sMeta.dcNorm) {
      const arr = dcMap.get(sMeta.dcNorm);
      if (arr) arr.forEach(i => candidates.add(i));
    }
    if (sMeta.firstNorm) {
      const arr = firstNameMap.get(sMeta.firstNorm);
      if (arr) arr.forEach(i => candidates.add(i));
    }

    // If no candidates found, fall back to a recent window of processed characters
    let candidateIndices: number[] = [];
    if (candidates.size > 0) candidateIndices = Array.from(candidates);
    else {
      const window = 200;
      const start = Math.max(0, processed.length - window);
      for (let i = start; i < processed.length; i++) candidateIndices.push(i);
    }

    // Choose a matching candidate by boolean test. Prefer more recent matches.
    candidateIndices.sort((a, b) => (processed[b].lastAppearanceIndex ?? 0) - (processed[a].lastAppearanceIndex ?? 0));
    let bestIdx = -1;
    for (const p of candidateIndices) {
      const pm = processedMeta[p];
      if (!pm) continue;
      if (isSameCharacter(sMeta, pm, processed[p])) { bestIdx = p; break; }
    }

    let matched = false;

    if (bestIdx !== -1) {
      matched = true;
      const pcRef = processed[bestIdx];
        // update final fields to the most recent values from this snapshot
        pcRef.finalName = entryName || pcRef.finalName;
        pcRef.finalAffiliation = entryAff || pcRef.finalAffiliation;
        pcRef.finalSocialClass = entryClass || pcRef.finalSocialClass;
        pcRef.vsUsername = entryVS || pcRef.vsUsername;
        pcRef.discordUsername = entryDC || pcRef.discordUsername;

        // update processedMeta and maps for this processed index
          processedMeta[bestIdx] = {
            nameNorm: normalize(pcRef.finalName),
            vsNorm: normalize(pcRef.vsUsername || ''),
            dcNorm: normalize(pcRef.discordUsername || ''),
            firstNorm: firstName(pcRef.finalName),
            yom: pcRef.startYear || 0
          };
        addToMap(vsMap, processedMeta[bestIdx].vsNorm, bestIdx);
        addToMap(dcMap, processedMeta[bestIdx].dcNorm, bestIdx);
        addToMap(firstNameMap, processedMeta[bestIdx].firstNorm, bestIdx);

        // appearance meta (use game-month index for indices)
        const monthIndex = snapshotGameIndices[idx];
        if (!pcRef.firstAppearanceDateStr) pcRef.firstAppearanceDateStr = entryDateStr;
        pcRef.lastAppearanceDateStr = entryDateStr;
        if (pcRef.firstAppearanceIndex === undefined) pcRef.firstAppearanceIndex = isNaN(monthIndex) ? idx : monthIndex;
        pcRef.lastAppearanceIndex = isNaN(monthIndex) ? idx : monthIndex;

        // maintain startYear: prefer Year of Maturity if present, otherwise keep existing or set later
        if ((!pcRef.startYear || pcRef.startYear === 0) && entryYOM && entryYOM > 0) {
          pcRef.startYear = entryYOM;
        }

        // ensure endYear is from last appearance (use game-month index)
        const lastGameIndex = snapshotGameIndices[idx];
        if (!isNaN(lastGameIndex)) pcRef.endYear = Math.floor(lastGameIndex / 12);

        // handle segments
        const lastSeg = pcRef.segments[pcRef.segments.length - 1];
        const sameSegment = lastSeg && lastSeg.socialClass === entryClass && lastSeg.affiliation === entryAff && normalize(lastSeg.name) === normalize(entryName) && (lastSeg.vsUsername || '') === (entryVS || '') && (lastSeg.discordUsername || '') === (entryDC || '');
        if (sameSegment && lastSeg) {
          // extend
          lastSeg.end = isNaN(snapshotGameIndices[idx]) ? idx : snapshotGameIndices[idx];
        } else {
          // close previous segment (if any) and add new
          const monthIndexLocal = snapshotGameIndices[idx];
          if (lastSeg && lastSeg.end < (isNaN(monthIndexLocal) ? idx : monthIndexLocal)) {
            lastSeg.end = (isNaN(monthIndexLocal) ? idx : monthIndexLocal) - 1;
          }
          const newSeg: Segment = {
            start: isNaN(monthIndexLocal) ? idx : monthIndexLocal,
            end: isNaN(monthIndexLocal) ? idx : monthIndexLocal,
            socialClass: entryClass,
            affiliation: entryAff,
            name: entryName,
            vsUsername: entryVS || undefined,
            discordUsername: entryDC || undefined
          };
          pcRef.segments.push(newSeg);
        }
      
    }

    if (!matched) {
      // create a new processed character
      const id = `char-${idCounter++}`;
      const monthIndexNew = snapshotGameIndices[idx];
      const firstYear = entryYOM && entryYOM > 0 ? entryYOM : (isNaN(monthIndexNew) ? 0 : Math.floor(monthIndexNew / 12));
      const lastYear = isNaN(monthIndexNew) ? firstYear : Math.floor(monthIndexNew / 12);
      const pc: ProcessedCharacter = {
        id,
        finalName: entryName,
        finalAffiliation: entryAff,
        finalSocialClass: entryClass,
        vsUsername: entryVS || undefined,
        discordUsername: entryDC || undefined,
        startYear: firstYear || 0,
        endYear: lastYear || 0,
        firstAppearanceDateStr: entryDateStr || undefined,
        lastAppearanceDateStr: entryDateStr || undefined,
        firstAppearanceIndex: isNaN(monthIndexNew) ? idx : monthIndexNew,
        lastAppearanceIndex: isNaN(monthIndexNew) ? idx : monthIndexNew,
        segments: [{
          start: isNaN(monthIndexNew) ? idx : monthIndexNew,
          end: isNaN(monthIndexNew) ? idx : monthIndexNew,
          socialClass: entryClass,
          affiliation: entryAff,
          name: entryName,
          vsUsername: entryVS || undefined,
          discordUsername: entryDC || undefined
        }]
      };
      processed.push(pc);
      // register meta and maps for the new processed character
      const newIdx = processed.length - 1;
      const meta = {
        nameNorm: normalize(pc.finalName),
        vsNorm: normalize(pc.vsUsername || ''),
        dcNorm: normalize(pc.discordUsername || ''),
        firstNorm: firstName(pc.finalName),
        yom: entryYOM || 0
      };
      processedMeta.push(meta);
      addToMap(vsMap, meta.vsNorm, newIdx);
      addToMap(dcMap, meta.dcNorm, newIdx);
      addToMap(firstNameMap, meta.firstNorm, newIdx);
    }
  }

  // Finalize: ensure segment end indices and compute start/end years where missing
  for (const pc of processed) {
    if (pc.segments.length > 0) {
      const lastSeg = pc.segments[pc.segments.length - 1];
      if (lastSeg.end === undefined) lastSeg.end = pc.lastAppearanceIndex ?? lastSeg.start;
      // ensure last seg end equals lastAppearanceIndex
      if (pc.lastAppearanceIndex !== undefined) lastSeg.end = pc.lastAppearanceIndex;
    }

    if ((!pc.startYear || pc.startYear === 0) && pc.firstAppearanceDateStr) {
      const d = new Date(pc.firstAppearanceDateStr);
      if (isFinite(d.getTime())) pc.startYear = gameMonthIndexForDate(d);
      else {
        const m = pc.firstAppearanceDateStr.match(/(20\d{2}|19\d{2})/);
        if (m) pc.startYear = Number(m[0]) * 12;
      }
    }

    if ((!pc.endYear || pc.endYear === 0) && pc.lastAppearanceDateStr) {
      const d = new Date(pc.lastAppearanceDateStr);
      if (isFinite(d.getTime())) pc.endYear = gameMonthIndexForDate(d);
      else {
        const m = pc.lastAppearanceDateStr.match(/(20\d{2}|19\d{2})/);
        if (m) pc.endYear = Number(m[0]) * 12;
      }
    }
  }

  // Deduplication by username has been removed for now — return processed characters as-is.
  return processed;
}