'use strict';

import {decode, CONSTANTS} from './protocol';

const chunkDecoder = (onDecoded) => {
  let left = Buffer.alloc(0);

  return function onDataChunk (chunk) {
    let start = 0;

    while (chunk.indexOf(CONSTANTS.PACKET_END, start) !== -1 && start < chunk.length) {
      const offset = chunk.indexOf(CONSTANTS.PACKET_END);

      const packet = (start === 0 && left.length)
        ? Buffer.concat([left, chunk.slice(start, start + offset)])
        : chunk.slice(start, start + offset);

      const decoded = decode(packet);
      onDecoded(decoded);
      start += offset + 1;
    }
    if (start < chunk.length) {
      left = Buffer.concat([left, chunk.slice(start)]);
    }
  };
};

export default chunkDecoder;
