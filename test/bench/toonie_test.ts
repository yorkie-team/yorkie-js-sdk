import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { converter } from '@yorkie-js-sdk/src/yorkie';
import { helloBuffer } from './hello_buffer';
import { nXIQ0KXbuffer } from './nXIQ0KX_buffer';

function stringToUint(string: string) {
  const array = string.split(',');
  const uintArray = [];
  for (let i = 0; i < array.length; i++) {
    uintArray.push(Number(array[i]));
  }
  return new Uint8Array(uintArray);
}

const tests = [
  {
    name: 'Toonie#hello',
    run: (): void => {
      const snapshot = stringToUint(helloBuffer);
      const root = new CRDTRoot(converter.bytesToObject(snapshot));
      root.deepcopy();
    },
  },
  {
    name: 'Toonie#nXIQ0KX',
    run: (): void => {
      const snapshot = stringToUint(nXIQ0KXbuffer);
      const root = new CRDTRoot(converter.bytesToObject(snapshot));
      root.deepcopy();
    },
  },
];

export default tests;
