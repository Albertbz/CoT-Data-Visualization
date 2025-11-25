import { sheets_v4 } from 'googleapis';

/**
 * Given a 3D array of cells from multiple sheets, parses the data into
 * an array of objects for easier processing. The first row of each sheet is assumed
 * to be the header row, and subsequent rows are data rows.
 * 
 * @param allSheetData A 3D array where the first dimension is the sheet name,
 * the second dimension are the rows, and the third dimension are the cells.
 * @returns An object where each key is a sheet name and the value is an array
 * of objects representing the rows in that sheet.
 */
export function parseSheetData(allSheetData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]}): { [sheetName: string]: { [key: string]: string | number | boolean }[] } {
  const parsedData: { [sheetName: string]: { [key: string]: string | number | boolean }[] } = {};

  for (const sheetName in allSheetData) {
    const sheetData = allSheetData[sheetName];
    if (sheetData.length === 0) {
      parsedData[sheetName] = [];
      continue;
    }

    const headers = sheetData[0].map(cell => cell.cellValue) as (string | number | boolean)[];
    const rows = sheetData.slice(1);

    const parsedRows = rows.map((row) => {
      const rowObject: { [key: string]: string | number | boolean } = {};
      headers.forEach((header, index) => {
        rowObject[String(header)] = row[index].cellValue;
      });
      return rowObject;
    });

    parsedData[sheetName] = parsedRows;
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
export function cleanSheetData(allSheetData: { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]}): { [sheetName: string]: { cellValue: string | number | boolean; cellFormat: sheets_v4.Schema$CellFormat }[][]} {
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