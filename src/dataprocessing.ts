import { sheets_v4 } from 'googleapis';

/**
 * Given a 3D array of cells from multiple sheets, parses the data into
 * an array of objects for easier processing. The first row of each sheet is assumed
 * to be the header row, and subsequent rows are data rows.
 * 
 * @param allSheetData A 3D array where the first dimension is the sheet name,
 * the second dimension are the rows, and the third dimension are the cells.
 * @returns An array of objects of all characters.
 */
export function parseHouseData(allSheetData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]}): { "Social Class": string; "House": string; "Role": string; "Character Name": string; "VS Username": string; "Discord Username": string; "Timezone": string; "Comments": string }[] {
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
export function cleanHouseData(allSheetData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]}): { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]} {
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

        const newSheetData: {cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat}[][] = [];
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

            const newRow: {cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat}[] = [];
            newRow.push({cellValue: socialClass, cellFormat: {}}); // Social Class
            newRow.push({cellValue: row[0] ? row[0].cellValue : '', cellFormat: row[0]?.cellFormat}); // Role
            newRow.push({cellValue: row[1] ? row[1].cellValue : '', cellFormat: row[1]?.cellFormat}); // Character Name
            newRow.push({cellValue: row[2] ? row[2].cellValue : '', cellFormat: row[2]?.cellFormat}); // VS Username (IGN)
            newRow.push({cellValue: row[3] ? row[3].cellValue : '', cellFormat: row[3]?.cellFormat}); // Discord Username (Discord)
            // Timezone might be missing in some old formats
            if (!hasTimezone) {
              newRow.push({cellValue: '', cellFormat: {}}); // Timezone empty
              newRow.push({cellValue: row[4] ? row[4].cellValue : '', cellFormat: row[4]?.cellFormat}); // Comments
            } else {
              newRow.push({cellValue: row[4] ? row[4].cellValue : '', cellFormat: row[4]?.cellFormat}); // Timezone
              newRow.push({cellValue: row[5] ? row[5].cellValue : '', cellFormat: row[5]?.cellFormat}); // Comments
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

    parsedData.push(rowObject);
  }

  return parsedData;
}