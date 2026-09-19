"""Read-only OOXML extraction for independently testing parser mapping, not the web reader."""
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def coordinate(ref):
    letters, row = re.fullmatch(r'([A-Z]+)(\d+)', ref).groups()
    column = 0
    for letter in letters:
        column = column * 26 + ord(letter) - 64
    return {'r': int(row) - 1, 'c': column - 1}


with zipfile.ZipFile(sys.argv[1]) as archive:
    strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = [''.join(node.text or '' for node in item.findall('.//m:t', NS))
                   for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    relationships = {item.get('Id'): item.get('Target') for item in
                     ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
    result = {'SheetNames': [], 'Sheets': {}}
    for item in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS):
        name = item.get('name')
        target = relationships[item.get(REL)]
        path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        root = ET.fromstring(archive.read(path))
        sheet = {'!ref': root.find('m:dimension', NS).get('ref'), '!merges': []}
        for merge in root.findall('m:mergeCells/m:mergeCell', NS):
            start, end = merge.get('ref').split(':')
            sheet['!merges'].append({'s': coordinate(start), 'e': coordinate(end)})
        for cell in root.findall('m:sheetData/m:row/m:c', NS):
            value = cell.find('m:v', NS)
            value = value.text if value is not None else None
            kind = cell.get('t', 'n')
            if kind == 's':
                value = strings[int(value)]
            elif kind == 'inlineStr':
                value = ''.join(node.text or '' for node in cell.findall('.//m:t', NS))
            elif kind == 'n' and value is not None:
                value = float(value)
            entry = {'t': kind, 'v': value}
            formula = cell.find('m:f', NS)
            if formula is not None:
                entry['f'] = formula.text or '(shared formula)'
            sheet[cell.get('r')] = entry
        result['SheetNames'].append(name)
        result['Sheets'][name] = sheet
    with open(sys.argv[2], 'w', encoding='utf-8') as output:
        json.dump(result, output, ensure_ascii=False)
