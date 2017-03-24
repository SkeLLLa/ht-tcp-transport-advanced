'use strict';

import crypto from 'crypto';

const HEADER_START = '\u0001';
const DATA_START = '\u0002';
const DATA_END = '\u0003';
const PACKET_END = '\u0004';
const HEADER_DELIMITER = '/';
const FORMAT = {
  'JSON': 1,
  'BINARY': 2,
  'TEXT': 3
};

export const CONSTANTS = {
  HEADER_START,
  DATA_START,
  DATA_END,
  PACKET_END,
  FORMAT
};

export const encode = ({method, data, id}, error) => {
  id = id || crypto.randomBytes(10).toString('hex');
  const format = Buffer.isBuffer(data)
    ? CONSTANTS.FORMAT.BINARY
    : typeof data === 'string'
      ? CONSTANTS.FORMAT.TEXT
      : CONSTANTS.FORMAT.JSON;

  let dataBuf;
  const errString = error ? JSON.stringify(error) : '';
  switch (format) {
    case FORMAT.JSON:
      dataBuf = Buffer.from(JSON.stringify(data));
      break;
    case FORMAT.BINARY:
      dataBuf = data;
      break;
    case FORMAT.TEXT:
      dataBuf = Buffer.from(data);
      break;
  }

  return Buffer.concat([
    Buffer.from(HEADER_START),
    Buffer.from([id, method, dataBuf.length, format, errString].join(HEADER_DELIMITER)),
    Buffer.from(DATA_START),
    dataBuf,
    Buffer.from(DATA_END),
    Buffer.from(PACKET_END)
  ]);
};

export const decode = (packet) => {
  const headerIndex = {
    start: packet.indexOf(HEADER_START) + HEADER_START.length,
    end: packet.indexOf(DATA_START)
  };
  const dataIndex = {
    start: packet.indexOf(DATA_START) + DATA_START.length,
    end: packet.indexOf(Buffer.from(DATA_END + PACKET_END))
  };
  let [id, method, dataLength, format, errString] = packet.slice(headerIndex.start, headerIndex.end).toString().split(HEADER_DELIMITER);
  format = parseInt(format, 10);
  dataLength = parseInt(dataLength, 10);
  // if (dataIndex.end - dataIndex.start !== dataLength) {
  //   return null;
  // }
  let data;
  switch (format) {
    case FORMAT.JSON:
      data = JSON.parse(packet.slice(dataIndex.start, dataIndex.end).toString());
      break;
    case FORMAT.BINARY:
      data = packet.slice(dataIndex.start, dataIndex.end);
      break;
    case FORMAT.TEXT:
      data = packet.slice(dataIndex.start, dataIndex.end).toString();
      break;
  }
  const header = {
    id, method, dataLength, format
  };
  if (errString) {
    header.error = JSON.parse(errString);
  }
  return {
    header,
    data
  };
};
