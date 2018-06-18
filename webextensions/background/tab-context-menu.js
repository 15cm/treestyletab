/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

/*
 Workaround until native context menu becomes available.
 I have very less motivation to maintain this for future versions.
 See also: https://bugzilla.mozilla.org/show_bug.cgi?id=1376251
           https://bugzilla.mozilla.org/show_bug.cgi?id=1396031
*/

import {
  log as internalLogger,
  configs
} from '../common/common.js';
import * as TSTAPI from '../common/tst-api.js';
import EventListenerManager from '../common/EventListenerManager.js';

function log(...args) {
  if (configs.logFor['background/tab-context-menu'])
    internalLogger(...args);
}

export const onTSTItemClick = new EventListenerManager();

export function init() {
  browser.runtime.onMessage.addListener(onMessage);
  browser.runtime.onMessageExternal.addListener(onExternalMessage);

  window.addEventListener('unload', () => {
    browser.runtime.onMessage.removeListener(onMessage);
    browser.runtime.onMessageExternal.removeListener(onExternalMessage);
  }, { once: true });
}

const gExtraItems = new Map();

function getItemsFor(addonId) {
  if (gExtraItems.has(addonId)) {
    return gExtraItems.get(addonId);
  }
  const items = [];
  gExtraItems.set(addonId, items);
  return items;
}

function exportExtraItems() {
  const exported = {};
  for (const [id, items] of gExtraItems.entries()) {
    exported[id] = items;
  }
  return exported;
}

async function notifyUpdated() {
  await browser.runtime.sendMessage({
    type:  TSTAPI.kCONTEXT_MENU_UPDATED,
    items: exportExtraItems()
  });
}

let gReservedNotifyUpdate;
let gNotifyUpdatedHandlers = [];

function reserveNotifyUpdated() {
  return new Promise((resolve, _aReject) => {
    gNotifyUpdatedHandlers.push(resolve);
    if (gReservedNotifyUpdate)
      clearTimeout(gReservedNotifyUpdate);
    gReservedNotifyUpdate = setTimeout(async () => {
      gReservedNotifyUpdate = undefined;
      await notifyUpdated();
      const handlers = gNotifyUpdatedHandlers;
      gNotifyUpdatedHandlers = [];
      for (const handler of handlers) {
        handler();
      }
    }, 100);
  });
}

function onMessage(message, _aSender) {
  log('tab-context-menu: internally called:', message);
  switch (message.type) {
    case TSTAPI.kCONTEXT_MENU_GET_ITEMS:
      return Promise.resolve(exportExtraItems());

    case TSTAPI.kCONTEXT_MENU_CLICK:
      onTSTItemClick.dispatch(message.info, message.tab);
      return;
  }
}

export function onExternalMessage(message, sender) {
  log('tab-context-menu: API called:', message, sender);
  switch (message.type) {
    case TSTAPI.kCONTEXT_MENU_CREATE: {
      const items  = getItemsFor(sender.id);
      let params = message.params;
      if (Array.isArray(params))
        params = params[0];
      let shouldAdd = true;
      if (params.id) {
        for (let i = 0, maxi = items.length; i < maxi; i++) {
          const item = items[i];
          if (item.id != params.id)
            continue;
          items.splice(i, 1, params);
          shouldAdd = false;
          break;
        }
      }
      if (shouldAdd)
        items.push(params);
      gExtraItems.set(sender.id, items);
      return reserveNotifyUpdated();
    }; break;

    case TSTAPI.kCONTEXT_MENU_UPDATE: {
      const items = getItemsFor(sender.id);
      for (let i = 0, maxi = items.length; i < maxi; i++) {
        const item = items[i];
        if (item.id != message.params[0])
          continue;
        items.splice(i, 1, Object.assign({}, item, message.params[1]));
        break;
      }
      gExtraItems.set(sender.id, items);
      return reserveNotifyUpdated();
    }; break;

    case TSTAPI.kCONTEXT_MENU_REMOVE: {
      let items = getItemsFor(sender.id);
      let id    = message.params;
      if (Array.isArray(id))
        id = id[0];
      items = items.filter(item => item.id != id);
      gExtraItems.set(sender.id, items);
      return reserveNotifyUpdated();
    }; break;

    case TSTAPI.kCONTEXT_MENU_REMOVE_ALL:
    case TSTAPI.kUNREGISTER_SELF: {
      delete gExtraItems.delete(sender.id);
      return reserveNotifyUpdated();
    }; break;
  }
}
