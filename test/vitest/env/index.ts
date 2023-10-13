import { CookieJar, JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { Environment } from 'vitest';
import { populateGlobal } from 'vitest/environments';

function catchWindowErrors(window: Window) {
  let userErrorListenerCount = 0;
  function throwUnhandlerError(e: ErrorEvent) {
    if (userErrorListenerCount === 0 && e.error != null)
      process.emit('uncaughtException', e.error);
  }
  const addEventListener = window.addEventListener.bind(window);
  const removeEventListener = window.removeEventListener.bind(window);
  window.addEventListener('error', throwUnhandlerError);
  window.addEventListener = function (
    ...args: Parameters<typeof addEventListener>
  ) {
    if (args[0] === 'error') userErrorListenerCount++;
    return addEventListener.apply(this, args);
  };
  window.removeEventListener = function (
    ...args: Parameters<typeof removeEventListener>
  ) {
    if (args[0] === 'error' && userErrorListenerCount) userErrorListenerCount--;
    return removeEventListener.apply(this, args);
  };
  return function clearErrorHandlers() {
    window.removeEventListener('error', throwUnhandlerError);
  };
}

const AllowedKeys = ['Uint8Array'];

export default <Environment>{
  name: 'jsdom',
  transformMode: 'web',
  async setupVM({ jsdom = {} }) {
    const {
      html = '<!DOCTYPE html>',
      userAgent,
      url = 'http://localhost:3000',
      contentType = 'text/html',
      pretendToBeVisual = true,
      includeNodeLocations = false,
      runScripts = 'dangerously',
      resources,
      console = false,
      cookieJar = false,
      ...restOptions
    } = jsdom as any;
    const dom = new JSDOM(html, {
      pretendToBeVisual,
      resources:
        resources ??
        (userAgent ? new ResourceLoader({ userAgent }) : undefined),
      runScripts,
      url,
      virtualConsole:
        console && globalThis.console
          ? new VirtualConsole().sendTo(globalThis.console)
          : undefined,
      cookieJar: cookieJar ? new CookieJar() : undefined,
      includeNodeLocations,
      contentType,
      userAgent,
      ...restOptions,
    });
    const clearWindowErrors = catchWindowErrors(dom.window as any);

    // TODO: browser doesn't expose Buffer, but a lot of dependencies use it
    dom.window.Buffer = Buffer;

    // inject web globals if they missing in JSDOM but otherwise available in Nodejs
    // https://nodejs.org/dist/latest/docs/api/globals.html
    const globalNames = [
      'structuredClone',
      'fetch',
      'Request',
      'Response',
      'BroadcastChannel',
      'MessageChannel',
      'MessagePort',
    ] as const;
    for (const name of globalNames) {
      const value = globalThis[name];
      if (
        typeof value !== 'undefined' &&
        typeof dom.window[name] === 'undefined'
      )
        dom.window[name] = value;
    }

    return {
      getVmContext() {
        return dom.getInternalVMContext();
      },
      teardown() {
        clearWindowErrors();
        dom.window.close();
      },
    };
  },
  async setup(global, { jsdom = {} }) {
    const { CookieJar, JSDOM, ResourceLoader, VirtualConsole } =
      (await require('jsdom')) as typeof import('jsdom');
    const {
      html = '<!DOCTYPE html>',
      userAgent,
      url = 'http://localhost:3000',
      contentType = 'text/html',
      pretendToBeVisual = true,
      includeNodeLocations = false,
      runScripts = 'dangerously',
      resources,
      console = false,
      cookieJar = false,
      ...restOptions
    } = jsdom as any;
    const dom = new JSDOM(html, {
      pretendToBeVisual,
      resources:
        resources ??
        (userAgent ? new ResourceLoader({ userAgent }) : undefined),
      runScripts,
      url,
      virtualConsole:
        console && global.console
          ? new VirtualConsole().sendTo(global.console)
          : undefined,
      cookieJar: cookieJar ? new CookieJar() : undefined,
      includeNodeLocations,
      contentType,
      userAgent,
      ...restOptions,
    });

    const { keys, originals } = populateGlobal(global, dom.window, {
      bindFunctions: true,
    });

    AllowedKeys.forEach((key) => {
      global[key] = originals.get(key);
    });

    const clearWindowErrors = catchWindowErrors(global);

    return {
      teardown(global) {
        clearWindowErrors();
        dom.window.close();
        keys.forEach((key) => delete global[key]);
        originals.forEach((v, k) => (global[k] = v));
      },
    };
  },
};
