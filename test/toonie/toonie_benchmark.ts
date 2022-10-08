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

describe('Hello Doc Test', function () {
  let helloDocRoot: CRDTRoot;
  let nXIQ0KXDocRoot: CRDTRoot;
  it('should test hello doc applySnapshot', async function () {
    const snapshot = stringToUint(helloBuffer);

    const currentTime = new Date();
    const obj = converter.bytesToObject(snapshot);
    helloDocRoot = new CRDTRoot(obj);
    const endTime = new Date();

    const elapsedTime = endTime.getTime() - currentTime.getTime();

    console.log(elapsedTime / 1000, ' time consumed');
  });

  it('should test nXIQ0KX doc applySnapshot', async function () {
    const snapshot = stringToUint(nXIQ0KXbuffer);

    const currentTime = new Date();
    const obj = converter.bytesToObject(snapshot);
    nXIQ0KXDocRoot = new CRDTRoot(obj);
    const endTime = new Date();

    const elapsedTime = endTime.getTime() - currentTime.getTime();

    console.log(elapsedTime / 1000, ' time consumed');
  });

  it('should test hello doc deepcopy', async function () {
    const currentTime = new Date();

    helloDocRoot.deepcopy();

    const endTime = new Date();
    const elapsedTime = endTime.getTime() - currentTime.getTime();

    console.log(elapsedTime / 1000, ' time consumed');
  });

  it('should test nXIQ0KX doc deepcopy', async function () {
    const currentTime = new Date();

    nXIQ0KXDocRoot.deepcopy();

    const endTime = new Date();
    const elapsedTime = endTime.getTime() - currentTime.getTime();

    console.log(elapsedTime / 1000, ' time consumed');
  });
});
