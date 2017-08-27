/* ***** BEGIN LICENSE BLOCK ***** 
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Tree Style Tab.
 *
 * The Initial Developer of the Original Code is YUKI "Piro" Hiroshi.
 * Portions created by the Initial Developer are Copyright (C) 2010-2017
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): YUKI "Piro" Hiroshi <piro.outsider.reflex@gmail.com>
 *                 Infocatcher <https://github.com/Infocatcher>
 *                 Tetsuharu OHZEKI <https://github.com/saneyuki>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ******/
'use strict';

const kTREE_DROP_TYPE = 'application/x-treestyletab-tree';

var gAutoExpandedTabs = [];
var gAutoExpandWhileDNDTimer;
var gAutoExpandWhileDNDTimerNext;

function startListenDragEvents(aTarget) {
  aTarget.addEventListener('dragstart', onDragStart);
  aTarget.addEventListener('dragover', onDragOver);
  aTarget.addEventListener('dragenter', onDragEnter);
  aTarget.addEventListener('dragleave', onDragLeave);
  aTarget.addEventListener('drop', onDrop);
  aTarget.addEventListener('dragend', onDragEnd);
}

function endListenDragEvents(aTarget) {
  aTarget.removeEventListener('dragstart', onDragStart);
  aTarget.removeEventListener('dragover', onDragOver);
  aTarget.removeEventListener('dragenter', onDragEnter);
  aTarget.removeEventListener('dragleave', onDragLeave);
  aTarget.removeEventListener('drop', onDrop);
  aTarget.removeEventListener('dragend', onDragEnd);
}


function getDragDataFromOneTab(aTab) {
  aTab = getTabFromChild(aTab);
  if (!aTab)
    return {
      tabNode:  null,
      tabNodes: [],
      tabId:    null,
      tabIds:   [],
      windowId: null
    };

  var draggedTabs = [aTab].concat(getDescendantTabs(aTab)); //tabsDragUtils.getSelectedTabs(aTab || aInfo.event);
  return {
    tabNode:  aTab,
    tabNodes: draggedTabs,
    tabId:    aTab.apiTab.id,
    tabIds:   draggedTabs.map(aDraggedTab => aDraggedTab.apiTab.id),
    windowId: aTab.apiTab.windowId
  };
}

function sanitizeDragData(aDragData) {
  return {
    tabNode:  null,
    tabNodes: [],
    tabId:    aDragData.tabId,
    tabIds:   aDragData.tabIds,
    windowId: aDragData.windowId
  };
}

function getDropAction(aEvent) {
  var info = getDropActionInternal(aEvent);
  info.canDrop = true;
  if (info.draggedTab) {
    var isCopy = isCopyAction(aEvent);
    if (isCopy)
      info.action |= kACTION_DUPLICATE;
    if (!isCopy && !info.dragData.tabNode)
      info.action |= kACTION_IMPORT;

    if (info.action & kACTION_AFFECTS_TO_DESTINATION) {
      if (info.action & kACTION_MOVE)
        info.action ^= kACTION_MOVE;
      if (info.action & kACTION_STAY)
        info.action ^= kACTION_STAY;
    }

    if (info.dragOverTab &&
        isPinned(info.draggedTab) != isPinned(info.dragOverTab)) {
      info.canDrop = false;
    }
    else if (info.action & kACTION_ATTACH) {
      if (info.parent == info.draggedTab) {
        info.canDrop = false;
      }
      else if (info.dragOverTab &&
               getAncestorTabs(info.dragOverTab).indexOf(info.draggedTab) > -1) {
        info.canDrop = false;
      }
    }
  }

  if (info.dragOverTab &&
      (isHidden(info.dragOverTab) ||
       (isCollapsed(info.dragOverTab) &&
        info.dropPosition != kDROP_AFTER)))
    info.canDrop = false;

  return info;
}
function getDropActionInternal(aEvent) {
  //log('getDropActionInternal: start');
  var targetTab = getTabFromEvent(aEvent) || getTabFromTabbarEvent(aEvent) || aEvent.target;
  var targetTabs = getTabs(targetTab);
  var firstTargetTab = getFirstNormalTab(targetTab) || targetTabs[0];
  var lastTargetTabIndex = targetTabs.length - 1;
  var lastTargetTab      = targetTabs[lastTargetTabIndex];
  var info       = {
    dragOverTab  : targetTab,
    draggedTab   : null,
    draggedTabs  : [],
    targetTab    : targetTab,
    dropPosition : null,
    action       : null,
    parent       : null,
    insertBefore : null,
    insertAfter  : null
  };

  var dragData = aEvent.dataTransfer.getData(kTREE_DROP_TYPE);
  info.dragData = dragData = dragData && JSON.parse(dragData);

  var draggedTab = getTabById(dragData && {
                     tab:    dragData.tabId,
                     window: dragData.windowId
                   });
  info.draggedTab = draggedTab;
  var draggedTabs = (!dragData || !dragData.tabIds) ?
                      [] :
                      dragData.tabIds.map(aTabId => getTabById({
                        tab:    aTabId,
                        window: dragData.windowId
                      })).filter(aTab => !!aTab);
  info.draggedTabs = draggedTabs;
  var isRemoteTab = !draggedTab && !!dragData.tabId;
  var isNewTabAction = !draggedTab && !dragData.tabId;

  if (!targetTab) {
    //log('dragging on non-tab element');
    let action = isRemoteTab ? kACTION_STAY : (kACTION_MOVE | kACTION_DETACH) ;
    if (isNewTabAction)
      action |= kACTION_NEWTAB;
    if (aEvent.clientY < firstTargetTab.getBoundingClientRect().top) {
      //log('dragging above the first tab');
      info.targetTab = info.parent = info.insertBefore = firstTargetTab;
      info.dropPosition = kDROP_BEFORE;
      info.action   = action;
      return info;
    }
    else if (aEvent.clientY > lastTargetTab.getBoundingClientRect().bottom) {
      //log('dragging below the last tab');
      info.targetTab = info.parent = lastTargetTab;
      info.dropPosition = kDROP_AFTER;
      info.action   = action;
      return info;
    }
    else {
      //log('dragging on the tab ', dumpTab(targetTab));
      let index = getTabIndex(targetTab);
      index = Math.min(index, lastTargetTabIndex);
      info.targetTab = targetTab = targetTabs[index];
      if (index == getTabIndex(lastTargetTab)) {
        if (index > 0)
          info.targetTab = targetTab = targetTabs[index - 1];
        info.dropPosition = kDROP_AFTER;
        //log('=> after the last tab');
      }
      else if (targetTab == firstTargetTab) {
        if (index < lastTargetTabIndex - 1)
          info.targetTab = targetTab = targetTabs[index + 1];
        info.dropPosition = kDROP_BEFORE;
        //log('=> before the first tab');
      }
      //log('info.targetTab = ', dumpTab(info.targetTab));
    }
  }
  else {
    //log('on the tab ', dumpTab(targetTab));
    //ensureTabInitialized(targetTab);
    info.targetTab = targetTab;
  }

  /**
   * Basically, tabs should have three areas for dropping of items:
   * [start][center][end], but, pinned tabs couldn't have its tree.
   * So, if a tab is dragged and the target tab is pinned, then, we
   * have to ignore the [center] area.
   */
  var onPinnedTab = isPinned(targetTab);
  var dropAreasCount = (draggedTab && onPinnedTab) ? 2 : 3 ;
  var targetTabRect = targetTab.getBoundingClientRect();
  var targetTabCoordinate = onPinnedTab ? targetTabRect.left : targetTabRect.top ;
  var targetTabSize = onPinnedTab ? targetTabRect.width : targetTabRect.height ;
  var beforeOrAfterDropAreaSize;
  if (dropAreasCount == 2) {
    beforeOrAfterDropAreaSize = Math.round(targetTabSize / dropAreasCount);
  }
  else { // enlarge the area to dop something on the tab itself
    beforeOrAfterDropAreaSize = Math.round(targetTabSize / 4);
  }
  var eventCoordinate = onPinnedTab ? aEvent.clientX : aEvent.clientY;
  //log('coordinates: ', {
  //  event: eventCoordinate,
  //  targetTab: targetTabCoordinate,
  //  area: beforeOrAfterDropAreaSize
  //});
  if (eventCoordinate < targetTabCoordinate + beforeOrAfterDropAreaSize) {
    info.dropPosition = kDROP_BEFORE ;
  }
  else if (dropAreasCount == 2 ||
           eventCoordinate > targetTabCoordinate + targetTabSize - beforeOrAfterDropAreaSize) {
    info.dropPosition = kDROP_AFTER ;
  }
  else {
    info.dropPosition = kDROP_ON;
  }

  switch (info.dropPosition)
  {
    case kDROP_ON: {
      //log('drop position = on the tab');
      let visibleNext = getNextVisibleTab(targetTab);
      info.action       = kACTION_STAY | kACTION_ATTACH;
      info.parent       = targetTab;
      info.insertBefore = configs.insertNewChildAt == kINSERT_FISRT ?
          (getFirstChildTab(targetTab) || visibleNext) :
          (getNextSiblingTab(targetTab) || getNextTab(getLastDescendantTab(targetTab) || targetTab));
     // if (info.insertBefore)
     //  log('insertBefore = ', dumpTab(info.insertBefore));
    }; break;

    case kDROP_BEFORE: {
      //log('drop position = before the tab');
/* strategy
  +-----------------------------------------------------
  |     <= detach from parent, and move
  |[TARGET  ]
  +-----------------------------------------------------
  |  [      ]
  |     <= attach to the parent of the target, and move
  |[TARGET  ]
  +-----------------------------------------------------
  |[        ]
  |     <= attach to the parent of the target, and move
  |[TARGET  ]
  +-----------------------------------------------------
  |[        ]
  |     <= attach to the parent of the target (previous tab), and move
  |  [TARGET]
  +-----------------------------------------------------
*/
      let prevTab = getPreviousVisibleTab(targetTab);
      if (!prevTab) {
        // allow to drop pinned tab to beside of another pinned tab
        if (draggedTab && isPinned(draggedTab)) {
          info.action       = kACTION_MOVE;
          info.insertBefore = targetTab;
        }
        else {
          info.action       = kACTION_MOVE | kACTION_DETACH;
          info.insertBefore = firstTargetTab;
        }
      }
      else {
        let prevLevel   = Number(prevTab.getAttribute(kNEST) || 0);
        let targetLevel = Number(targetTab.getAttribute(kNEST) || 0);
        info.parent       = (prevLevel < targetLevel) ? prevTab : getParentTab(targetTab) ;
        info.action       = kACTION_MOVE | (info.parent ? kACTION_ATTACH : kACTION_DETACH );
        info.insertBefore = targetTab;
      }
      //if (info.insertBefore)
      //  log('insertBefore = ', dumpTab(info.insertBefore));
    }; break;

    case kDROP_AFTER: {
      //log('drop position = after the tab');
/* strategy
  +-----------------------------------------------------
  |[TARGET  ]
  |     <= if the target has a parent, attach to it and and move
  +-----------------------------------------------------
  |  [TARGET]
  |     <= attach to the parent of the target, and move
  |[        ]
  +-----------------------------------------------------
  |[TARGET  ]
  |     <= attach to the parent of the target, and move
  |[        ]
  +-----------------------------------------------------
  |[TARGET  ]
  |     <= attach to the target, and move
  |  [      ]
  +-----------------------------------------------------
*/
      let nextTab = getNextVisibleTab(targetTab);
      if (!nextTab) {
        info.action = kACTION_MOVE | kACTION_ATTACH;
        info.parent = getParentTab(targetTab);
      }
      else {
        var targetLevel = Number(targetTab.getAttribute(kNEST) || 0);
        var nextLevel   = Number(nextTab.getAttribute(kNEST) || 0);
        info.parent       = (targetLevel < nextLevel) ? targetTab : getParentTab(targetTab) ;
        info.action       = kACTION_MOVE | (info.parent ? kACTION_ATTACH : kACTION_DETACH );
        info.insertBefore = nextTab;
        info.insertAfter  = targetTab;
/* strategy
  +-----------------------------------------------------
  |[TARGET   ]
  |     <= attach dragged tab to the parent of the target as its next sibling
  |  [DRAGGED]
  +-----------------------------------------------------
*/
        if (draggedTab == nextTab) {
          info.action = kACTION_MOVE | kACTION_ATTACH;
          info.parent = getParentTab(targetTab);
          info.insertBefore = getNextSiblingTab(targetTab);
          info.insertAfter  = targetTab;
          let ancestor = info.parent;
          while (ancestor && !info.insertBefore) {
            info.insertBefore = getNextSiblingTab(ancestor);
            ancestor = getParentTab(ancestor);
          }
        }
      }
      //if (info.insertBefore)
      //  log('insertBefore = ', dumpTab(info.insertBefore));
    }; break;
  }

  if (isNewTabAction)
    info.action |= kACTION_NEWTAB;

  return info;
}

function clearDropPosition() {
  for (let tab of document.querySelectorAll(`[${kDROP_POSITION}]`)) {
    tab.removeAttribute(kDROP_POSITION)
  }
}

function isDraggingAllTabs(aTab, aTabs) {
  var dragData = getDragDataFromOneTab(aTab);
  return dragData.tabIds.length == (aTabs || getAllTabs(aTab)).length;
}
 
function isDraggingAllCurrentTabs(aTab) {
  return isDraggingAllTabs(aTab, getTabs(aTab));
}

function collapseAutoExpandedTabsWhileDragging() {
  if (gAutoExpandedTabs.length > 0 &&
      configs.autoExpandCollapseFinally) {
    for (let tab of gAutoExpandedTabs) {
      collapseExpandSubtree(tab, {
        collapsed: false,
        justNow:   true,
        inRemote:  true
      });
    }
  }
  gAutoExpandedTabs = [];
}

async function handleDroppedNonTabItems(aEvent, aDropActionInfo) {
  aEvent.stopPropagation();

  var uris = retrieveURIsFromDragEvent(aEvent);
  // uris.forEach(aURI => {
  //   if (aURI.indexOf(kURI_BOOKMARK_FOLDER) != 0)
  //     securityCheck(aURI, aEvent);
  // });
  log('handleDroppedNonTabItems: ', uris);

  var inBackground = false; // prefs.getPref('browser.tabs.loadInBackground');
  if (aEvent.shiftKey)
    inBackground = !inBackground;

  var dragOverTab = aDropActionInfo.dragOverTab;
  if (dragOverTab &&
      aDropActionInfo.dropPosition == kDROP_ON &&
      (getDroppedLinksOnTabBehavior() & kDROPLINK_LOAD) &&
      !isLocked(dragOverTab) &&
      !isPinned(dragOverTab)) {
    await loadURI(uris.shift(), {
      tab:      dragOverTab,
      inRemote: true
    });
  }
  await openURIsInTabs(uris, {
    parent:       aDropActionInfo.parent,
    insertBefore: aDropActionInfo.insertBefore,
    insertAfter:  aDropActionInfo.insertAfter,
    inRemote:     true
  });
}

function retrieveURIsFromDragEvent(aEvent) {
  log('retrieveURIsFromDragEvent');
  var dt = aEvent.dataTransfer;
  var urls = [];
  var types = [
      'text/x-moz-place',
      'text/uri-list',
      'text/x-moz-text-internal',
      'text/x-moz-url',
      'text/plain',
      'application/x-moz-file'
    ];
  for (let i = 0; i < types.length; i++) {
    let dataType = types[i];
    for (let i = 0, maxi = dt.mozItemCount; i < maxi; i++) {
      let urlData = dt.mozGetDataAt(dataType, i);
      if (urlData) {
        urls = urls.concat(retrieveURIsFromData(urlData, dataType));
      }
    }
    if (urls.length)
      break;
  }
  log(' => retrieved: ', urls);
  urls = urls.filter(aURI =>
    aURI &&
      aURI.length &&
      aURI.indexOf(kBOOKMARK_FOLDER) == 0 ||
      !/^\s*(javascript|data):/.test(aURI)
  );
  log('  => filtered: ', urls);
  return urls;
}

const kBOOKMARK_FOLDER = 'x-moz-place:';
function retrieveURIsFromData(aData, aType) {
  log('retrieveURIsFromData: ', aType, aData);
  switch (aType) {
    case 'text/x-moz-place': {
      let item = JSON.parse(aData);
      if (item.type == 'text/x-moz-place-container') {
        let children = item.children;
        if (!children) {
          children = item.children = retrieveBookmarksInFolder(item.id);
          aData = JSON.stringify(item);
        }
        // When a blank folder is dropped, just open a dummy tab with the folder name.
        if (children && children.length == 0) {
          let uri = makeGroupTabURI({ title: item.title });
          return [uri];
        }
      }
      let uri = item.uri;
      if (uri)
        return uri;
      else
        return `${kBOOKMARK_FOLDER}${aData}`;
    }; break;

    case 'text/uri-list':
      return aData.replace(/\r/g, '\n')
            .replace(/^\#.+$/gim, '')
            .replace(/\n\n+/g, '\n')
            .split('\n');

    case 'text/unicode':
    case 'text/plain':
    case 'text/x-moz-text-internal':
      return [aData.trim()];

    case 'application/x-moz-file':
      return [getURLSpecFromFile(aData)];
  }
  return [];
}


function onDragStart(aEvent) {
  var tab = aEvent.target;
  var dragData = getDragDataFromOneTab(tab);
  for (let draggedTab of dragData.tabNodes) {
    draggedTab.classList.add(kTAB_STATE_DRAGGING);
  }
  aEvent.dataTransfer.setData(kTREE_DROP_TYPE,
    JSON.stringify(sanitizeDragData(dragData)));
  getTabsContainer(tab).classList.add(kTABBAR_STATE_TAB_DRAGGING);
}

var gLastDragOverTimestamp = null;

function onDragOver(aEvent) {
  gLastDragOverTimestamp = Date.now();
  aEvent.preventDefault(); // this is required to override default dragover actions!
try{
  //autoScroll.processAutoScroll(aEvent);
  var info = getDropAction(aEvent);

/*
  // auto-switch for staying on tabs
  if (
    info.dropPosition == kDROP_ON &&
    info.targetTab &&
    !isActive(info.targetTab) &&
    '_dragTime' in observer && '_dragOverDelay' in observer
    ) {
    let time = observer.mDragTime || observer._dragTime || 0;
    let delay = observer.mDragOverDelay || observer._dragOverDelay || 0;
    let effects = '_setEffectAllowedForDataTransfer' in observer ?
            observer._setEffectAllowedForDataTransfer(aEvent) :
            observer._getDropEffectForTabDrag(aEvent) ;
    if (effects == 'link') {
      let now = Date.now();
      if (!time) {
        time = now;
        if ('mDragTime' in observer)
          observer.mDragTime = time;
        else
          observer._dragTime = time;
      }
      if (now >= time + delay)
        b.selectedTab = info.targetTab;
    }
  }
*/

/*
  let effects = '_setEffectAllowedForDataTransfer' in observer ?
            observer._setEffectAllowedForDataTransfer(aEvent) :
            observer._getDropEffectForTabDrag(aEvent) ;
*/
  if (!info.canDrop/* ||
      effects == 'none'*/) {
    aEvent.dataTransfer.effectAllowed = 'none';
    clearDropPosition();
    return;
  }

  var dropPositionTargetTab = info.targetTab;
  while (isCollapsed(dropPositionTargetTab)) {
    dropPositionTargetTab = getPreviousTab(dropPositionTargetTab);
  }
  if (!dropPositionTargetTab)
    dropPositionTargetTab = info.targetTab;
  //log('drop position tab: ', dumpTab(dropPositionTargetTab));

  var dropPosition = info.dropPosition == kDROP_BEFORE ? 'before' :
                     info.dropPosition == kDROP_AFTER ? 'after' :
                     'self';
  if (dropPositionTargetTab != info.draggedTab) {
    clearDropPosition();
    dropPositionTargetTab.setAttribute(kDROP_POSITION, dropPosition);
    //log('set drop position to ', dropPosition);
  }
}catch(e){log(String(e));}
}

function onDragEnter(aEvent) {
  var info = getDropAction(aEvent);
  var dt = aEvent.dataTransfer;
  if (info.action & kACTION_NEWTAB)
      dt.effectAllowed = dt.dropEffect = (
      !info.draggedTab ? 'link' :
      isCopyAction(aEvent) ? 'copy' :
      'move'
    );

  if (!info.canDrop) {
    dt.effectAllowed = dt.dropEffect = 'none';
    return;
  }

  if (!info.dragOverTab ||
      !configs.autoExpandEnabled)
    return;

  var container = info.targetTab.parentNode;
  clearTimeout(gAutoExpandWhileDNDTimer);
  clearTimeout(gAutoExpandWhileDNDTimerNext);

  if (aEvent.target == info.draggedTab)
    return;

  gAutoExpandWhileDNDTimerNext = setTimeout((aTargetId, aDraggedId) => {
    gAutoExpandWhileDNDTimerNext = null;
    gAutoExpandWhileDNDTimer = setTimeout(() => {
        let targetTab = getTabById(aTargetId);
        if (targetTab &&
            shouldTabAutoExpanded(targetTab) &&
            targetTab.getAttribute(kDROP_POSITION) == 'self') {
          let draggedTab = aDraggedId && getTabById(aDraggedId);
          if (configs.autoExpandIntelligently) {
            collapseExpandTreesIntelligentlyFor(targetTab, { inRemote: true });
          }
          else {
            if (container.autoExpandedTabs.indexOf(aTargetId) < 0)
                container.autoExpandedTabs.push(aTargetId);
            collapseExpandSubtree(targetTab, {
              collapsed: false,
              inRemote: true
            });
          }
        }
    }, configs.autoExpandDelay);
  }, 0, info.targetTab.id, info.draggedTab && info.draggedTab.id);
}

function onDragLeave(aEvent) {
  clearDropPosition();
  clearTimeout(gAutoExpandWhileDNDTimer);
  gAutoExpandWhileDNDTimer = null;
}

async function onDrop(aEvent) {
  setTimeout(() => collapseAutoExpandedTabsWhileDragging(), 0);
  clearDropPosition();

  var dropActionInfo = getDropAction(aEvent);
  var dt = aEvent.dataTransfer;
  if (dt.dropEffect != 'link' &&
      dt.dropEffect != 'move' &&
      !dropActionInfo.dragData.tabId) {
    log('invalid drop');
    return;
  }

  if (dropActionInfo.dragData.tabId) {
    log('there ar tabs drag');
    performTabsDragDrop({
      windowId:     dropActionInfo.dragData.windowId,
      tabIds:       dropActionInfo.dragData.tabIds,
      action:       dropActionInfo.action,
      attachTo:     dropActionInfo.parent,
      insertBefore: dropActionInfo.insertBefore,
      insertAfter:  dropActionInfo.insertAfter,
      destinationWindowId: gTargetWindow,
      duplicate:    dt.dropEffect == 'copy',
      inRemote:     true
    });
    return;
  }

  log('link or bookmark item is dropped');
  handleDroppedNonTabItems(aEvent, dropActionInfo);
}

function onDragEnd(aEvent) {
  log('onDragEnd');
  var dragData = aEvent.dataTransfer.getData(kTREE_DROP_TYPE);
  dragData = JSON.parse(dragData);

log('dragData: ', dragData);
  if (Array.isArray(dragData.tabIds)) {
    dragData.tabNodes = dragData.tabIds.map(aTabId => getTabById({
                          tab:    aTabId,
                          window: dragData.windowId
                        }));
    for (let draggedTab of dragData.tabNodes) {
      draggedTab.classList.remove(kTAB_STATE_DRAGGING);
    }
  }

  clearDropPosition();
  getTabsContainer(aEvent.target).classList.remove(kTABBAR_STATE_TAB_DRAGGING);
  collapseAutoExpandedTabsWhileDragging();

  if (aEvent.dataTransfer.dropEffect != 'none') {
    log('dragged items are processed by someone: ', aEvent.dataTransfer.dropEffect);
    return;
  }

  log('trying to detach tab from window');
  aEvent.stopPropagation();
  aEvent.preventDefault();

  if (gLastDragOverTimestamp &&
      Date.now() - gLastDragOverTimestamp < configs.preventTearOffTabsTimeout) {
    log('dropped at tab bar: detaching is canceled');
    return;
  }

  if (isDraggingAllCurrentTabs(dragData.tabNode)) {
    log('all tabs are dragged, so it is nonsence to tear off them from the window');
    return;
  }

  openNewWindowFromTabs(dragData.tabNodes, {
    duplicate: isAccelKeyPressed(aEvent),
    left:      aEvent.screenX,
    top:       aEvent.screenY,
    inRemote:  true
  });
}
