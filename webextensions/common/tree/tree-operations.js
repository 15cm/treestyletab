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
 * Portions created by the Initial Developer are Copyright (C) 2011-2017
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): YUKI "Piro" Hiroshi <piro.outsider.reflex@gmail.com>
 *                 wanabe <https://github.com/wanabe>
 *                 Tetsuharu OHZEKI <https://github.com/saneyuki>
 *                 Xidorn Quan <https://github.com/upsuper> (Firefox 40+ support)
 *                 lv7777 (https://github.com/lv7777)
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

async function attachTabTo(aChild, aParent, aOptions = {}) {
  if (!aParent || !aChild) {
    log('missing information: ', dumpTab(aParent), dumpTab(aChild));
    return;
  }

  log('attachTabTo: ', {
    child:    dumpTab(aChild),
    parent:   dumpTab(aParent),
    children: aParent.getAttribute(kCHILDREN),
    insertBefore: dumpTab(aOptions.insertBefore),
    insertAfter:  dumpTab(aOptions.insertAfter),
    dontMove: aOptions.dontMove,
    dontUpdateIndent: aOptions.dontUpdateIndent,
    forceExpand: aOptions.forceExpand,
    dontExpand: aOptions.forceExpand
  });
  if ((aParent.getAttribute(kCHILDREN) || '').indexOf(`|${aChild.id}|`) > -1) {
    log('=> already attached');
    if (!aOptions.dontMove && !aOptions.inRemote)
      await followDescendantsToMovedRoot(aChild, aOptions);
    return;
  }
  if (isPinned(aParent) || isPinned(aChild)) {
    log('=> pinned tabs cannot be attached');
    return;
  }
  var ancestors = [aParent].concat(getAncestorTabs(aChild));
  if (ancestors.indexOf(aChild) > -1) {
    log('=> canceled for recursive request');
    return;
  }

  detachTab(aChild, aOptions);

  var newIndex = -1;
  if (aOptions.dontMove) {
    aOptions.insertBefore = getNextTab(aChild);
    if (!aOptions.insertBefore)
      aOptions.insertAfter = getPreviousTab(aChild);
  }
  if (aOptions.insertBefore) {
    log('insertBefore: ', dumpTab(aOptions.insertBefore));
    newIndex = getTabIndex(aOptions.insertBefore);
  }
  else if (aOptions.insertAfter) {
    log('insertAfter: ', dumpTab(aOptions.insertAfter));
    newIndex = getTabIndex(aOptions.insertAfter) + 1;
  }
  var childIds = [];
  if (newIndex > -1) {
    log('newIndex (from insertBefore/insertAfter): ', newIndex);
    let expectedAllTabs = getAllTabs(aChild).filter((aTab) => aTab != aChild);

    let refIndex = aOptions.insertBefore ?
                     expectedAllTabs.indexOf(aOptions.insertBefore) :
                     expectedAllTabs.indexOf(aOptions.insertAfter) + 1;
    if (refIndex >= expectedAllTabs.length)
      expectedAllTabs.push(aChild);
    else
      expectedAllTabs.splice(refIndex, 0, aChild);

    childIds = expectedAllTabs.filter((aTab) => {
      return (aTab == aChild || aTab.getAttribute(kPARENT) == aParent.id);
    }).map((aTab) => {
      return aTab.id;
    });
  }
  else {
    let descendants = getDescendantTabs(aParent);
    log('descendants: ', descendants.map(dumpTab));
    if (descendants.length) {
      switch (configs.insertNewChildAt) {
        case kINSERT_LAST:
        default:
          newIndex = getTabIndex(descendants[descendants.length-1]) + 1;
          break;
        case kINSERT_FIRST:
          newIndex = getTabIndex(descendants[descendants.length]);
          break;
      }
    }
    else {
      newIndex = getTabIndex(aParent) + 1;
    }
    log('newIndex (from existing children): ', newIndex);
    // update and cleanup
    let children = getChildTabs(aParent);
    children.push(aChild);
    childIds = children.map((aTab) => aTab.id);
  }

  log('new children: ', childIds);
  if (childIds.length == 0)
    aParent.removeAttribute(kCHILDREN);
  else
    aParent.setAttribute(kCHILDREN, `|${childIds.join('|')}|`);

  var currentIndex = getTabIndex(aChild);
  log('calculated index: ', {
    current: currentIndex,
    new: newIndex
  });

  aChild.setAttribute(kPARENT, aParent.id);
  var parentLevel = parseInt(aParent.getAttribute(kNEST) || 0);
  if (!aOptions.dontUpdateIndent) {
    updateTabsIndent(aChild, parentLevel + 1);
    //checkTabsIndentOverflow();
  }
  //updateTabAsParent(aParent);
  //if (shouldInheritIndent && !aOptions.dontUpdateIndent)
    //this.inheritTabIndent(aChild, aParent);

  var nextTab = aOptions.insertBefore;
  var prevTab = aOptions.insertAfter;
  if (!nextTab && !prevTab) {
    let tabs = getTabs(aChild);
    nextTab = tabs[newIndex];
    if (!nextTab)
      prevTab = tabs[newIndex - 1];
  }
  log('move newly attached child: ', dumpTab(aChild), {
    next: dumpTab(nextTab),
    prev: dumpTab(prevTab)
  });
  if (nextTab)
    await moveTabSubtreeBefore(aChild, nextTab, aOptions);
  else
    await moveTabSubtreeAfter(aChild, prevTab, aOptions);

  if (aOptions.forceExpand) {
    collapseExpandSubtree(aParent, clone(aOptions, {
      collapsed: false,
      inRemote: false
    }));
  }
  else if (!aOptions.dontExpand) {
    if (configs.autoCollapseExpandSubtreeOnAttach &&
        shouldTabAutoExpanded(aParent))
      collapseExpandTreesIntelligentlyFor(aParent);

    let newAncestors = [aParent].concat(getAncestorTabs(aParent));
    if (configs.autoCollapseExpandSubtreeOnSelect) {
      newAncestors.forEach(aAncestor => {
        if (shouldTabAutoExpanded(aAncestor))
          collapseExpandSubtree(aAncestor, clone(aOptions, {
            collapsed: false,
            inRemote: false
          }));
      });
    }
    else if (shouldTabAutoExpanded(aParent)) {
      if (configs.autoExpandSubtreeOnAppendChild) {
        newAncestors.forEach(aAncestor => {
          if (shouldTabAutoExpanded(aAncestor))
            collapseExpandSubtree(aAncestor, clone(aOptions, {
              collapsed: false,
              inRemote: false
            }));
        });
      }
      else
        collapseExpandTab(aChild, clone(aOptions, {
          collapsed: true,
          inRemote: false
        }));
    }
    if (isCollapsed(aParent))
      collapseExpandTab(aChild, clone(aOptions, {
        collapsed: true,
        inRemote: false
      }));
  }
  else if (shouldTabAutoExpanded(aParent) ||
           isCollapsed(aParent)) {
    collapseExpandTab(aChild, clone(aOptions, {
      collapsed: true,
      inRemote: false
    }));
  }

  //promoteTooDeepLevelTabs(aChild);

  window.onTabAttached && onTabAttached(aChild, {
    parent: aParent
  });

  if (aOptions.inRemote || aOptions.broadcast) {
    browser.runtime.sendMessage({
      type:        kCOMMAND_ATTACH_TAB_TO,
      windowId:    aChild.apiTab.windowId,
      child:       aChild.id,
      parent:      aParent.id,
      insertBefore:     aOptions.insertBefore && aOptions.insertBefore.id,
      insertAfter:      aOptions.insertAfter && aOptions.insertAfter.id,
      dontMove:         !!aOptions.dontMove,
      dontUpdateIndent: !!aOptions.dontUpdateIndent,
      forceExpand:      !!aOptions.forceExpand,
      dontExpand:       !!aOptions.dontExpand,
      justNow:          !!aOptions.justNow
    });
  }
}

function detachTab(aChild, aOptions = {}) {
  log('detachTab: ', dumpTab(aChild), aOptions,
    new Error().stack.split('\n')[1]);
  var parent = getParentTab(aChild);
  if (!parent) {
    log('canceled for an orphan tab');
    return;
  }

  var childIds = (parent.getAttribute(kCHILDREN) || '').split('|').filter((aId) => aId && aId != aChild.id);
  if (childIds.length == 0) {
    parent.removeAttribute(kCHILDREN);
    log('no more child');
  }
  else {
    parent.setAttribute(kCHILDREN, `|${childIds.join('|')}|`);
    log('rest children: ', childIds);
  }
  aChild.removeAttribute(kPARENT);

  updateTabsIndent(aChild);

  window.onTabDetached && onTabDetached(aChild, {
    oldParent: parent
  });

  if (aOptions.inRemote || aOptions.broadcast) {
    browser.runtime.sendMessage({
      type:     kCOMMAND_DETACH_TAB,
      windowId: aChild.apiTab.windowId,
      tab:      aChild.id
    });
  }
}

function detachParent(aTabs, aOptions = {}) {
  if (!Array.isArray(aTabs))
    aTabs = [aTabs];
  for (let tab of aTabs) {
    if (aTabs.indexOf(getParentTab(tab)) > -1)
      continue;
    detachAllChildren(tab, clone(aOptions, {
      behavior : getCloseParentBehaviorForTab(
        tab,
        kCLOSE_PARENT_BEHAVIOR_PROMOTE_FIRST_CHILD
      )
    }));
  }
}

function detachAllChildren(aTab, aOptions = {}) {
  var children = getChildTabs(aTab);
  if (!children.length)
    return;

  if (!('behavior' in aOptions))
    aOptions.behavior = kCLOSE_PARENT_BEHAVIOR_SIMPLY_DETACH_ALL_CHILDREN;
  if (aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_CLOSE_ALL_CHILDREN)
    aOptions.behavior = kCLOSE_PARENT_BEHAVIOR_PROMOTE_FIRST_CHILD;

  aOptions.dontUpdateInsertionPositionInfo = true;

  var parent = getParentTab(aTab);
  if (isGroupTab(aTab) &&
      getTabs(aTab).filter((aTab) => aTab.removing).length == children.length) {
    aOptions.behavior = kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN;
    aOptions.dontUpdateIndent = false;
  }

  var nextTab = null;
  if (aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_DETACH_ALL_CHILDREN/* &&
      !utils.getTreePref('closeParentBehavior.moveDetachedTabsToBottom')*/) {
    nextTab = getNextSiblingTab(getRootTab(aTab));
  }

  if (aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_REPLACE_WITH_GROUP_TAB) {
    // open new group tab and replace the detaching tab with it.
    aOptions.behavior = kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN;
  }

  for (let i = 0, maxi = children.length; i < maxi; i++) {
    let child = children[i];
    if (aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_DETACH_ALL_CHILDREN) {
      detachTab(child, aOptions);
      moveTabSubtreeBefore(child, nextTab, aOptions);
    }
    else if (aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_PROMOTE_FIRST_CHILD) {
      detachTab(child, aOptions);
      if (i == 0) {
        if (parent) {
          attachTabTo(child, parent, clone(aOptions, {
            dontExpand : true,
            dontMove   : true
          }));
        }
        collapseExpandSubtree(child, clone(aOptions, { collapsed: false }));
        //deleteTabValue(child, kTAB_STATE_SUBTREE_COLLAPSED);
      }
      else {
        attachTabTo(child, children[0], clone(aOptions, {
          dontExpand : true,
          dontMove   : true
        }));
      }
    }
    else if (aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN && parent) {
      attachTabTo(child, parent, clone(aOptions, {
        dontExpand : true,
        dontMove   : true
      }));
    }
    else { // aOptions.behavior == kCLOSE_PARENT_BEHAVIOR_SIMPLY_DETACH_ALL_CHILDREN
      detachTab(child, aOptions);
    }
  }
}

function updateTabsIndent(aTabs, aLevel = undefined) {
  if (!aTabs)
    return;

  if (!Array.isArray(aTabs))
    aTabs = [aTabs];

  if (!aTabs.length)
    return;

  if (aLevel === undefined)
    aLevel = getAncestorTabs(aTabs[0]).length;

  for (let i = 0, maxi = aTabs.length; i < maxi; i++) {
    let item = aTabs[i];
    if (!item || isPinned(item))
      continue;

    window.onTabLevelChanged && onTabLevelChanged(item);
    item.setAttribute(kNEST, aLevel);
    updateTabsIndent(getChildTabs(item), aLevel + 1);
  }
}


// collapse/expand tabs

function shouldTabAutoExpanded(aTab) {
  return hasChildTabs(aTab) && isSubtreeCollapsed(aTab);
}

async function collapseExpandSubtree(aTab, aParams = {}) {
  aParams.collapsed = !!aParams.collapsed;
  if (!aTab)
    return;
  if (aParams.inRemote || aParams.broadcast) {
    await browser.runtime.sendMessage({
      type:      kCOMMAND_CHANGE_SUBTREE_COLLAPSED_STATE,
      windowId:  aTab.parentNode.windowId,
      tab:       aTab.id,
      collapsed: aParams.collapsed,
      manualOperation: !!aParams.manualOperation
    });
    if (aParams.inRemote)
      return;
  }
  //log('collapseExpandSubtree: ', dumpTab(aTab), aParams);
  var container = aTab.parentNode;
  container.doingCollapseExpandCount++;
  await collapseExpandSubtreeInternal(aTab, aParams);
  container.doingCollapseExpandCount--;
}
function collapseExpandSubtreeInternal(aTab, aParams = {}) {
  if ((isSubtreeCollapsed(aTab) == aParams.collapsed))
    return;

  var container = getTabsContainer(aTab);

  if (aParams.collapsed)
    aTab.classList.add(kTAB_STATE_SUBTREE_COLLAPSED);
  else
    aTab.classList.remove(kTAB_STATE_SUBTREE_COLLAPSED);
  //setTabValue(aTab, kTAB_STATE_SUBTREE_COLLAPSED, aParams.collapsed);

  var childTabs = getChildTabs(aTab);
  var lastExpandedTabIndex = childTabs.length - 1;
  for (let i = 0, maxi = childTabs.length; i < maxi; i++) {
    let childTab = childTabs[i];
    if (!aParams.collapsed &&
        !aParams.justNow &&
        i == lastExpandedTabIndex) {
      collapseExpandTab(childTab, {
         collapsed: aParams.collapsed,
         justNow:   aParams.justNow,
         last:      true
      });
    }
    else {
      collapseExpandTab(childTab, {
        collapsed: aParams.collapsed,
        justNow:   aParams.justNow
      });
    }
  }

  if (aParams.collapsed) {
    aTab.classList.remove(kTAB_STATE_SUBTREE_EXPANDED_MANUALLY);
    //deleteTabValue(aTab, kTAB_STATE_SUBTREE_EXPANDED_MANUALLY);
  }

  //if (configs.indentAutoShrink &&
  //    configs.indentAutoShrinkOnlyForVisible)
  //  checkTabsIndentOverflow();
}

function manualCollapseExpandSubtree(aTab, aParams = {}) {
  aParams.manualOperation = true;
  collapseExpandSubtree(aTab, aParams);
  if (!aParams.collapsed) {
    aTab.classList.add(kTAB_STATE_SUBTREE_EXPANDED_MANUALLY);
    //setTabValue(aTab, kTAB_STATE_SUBTREE_EXPANDED_MANUALLY, true);
  }
}

function collapseExpandTab(aTab, aParams = {}) {
  if (!aTab)
    return;

  var parent = getParentTab(aTab);
  if (!parent)
    return;

  if (aParams.collapsed)
    aTab.classList.add(kTAB_STATE_COLLAPSED);
  else
    aTab.classList.remove(kTAB_STATE_COLLAPSED);
  //setTabValue(aTab, kTAB_STATE_COLLAPSED, aParams.collapsed);

  window.onTabCollapsedStateChanging &&
    window.onTabCollapsedStateChanging(aTab, {
      collapsed: aParams.collapsed,
      justNow: aParams.justNow
    });

  //var data = {
  //  collapsed : aParams.collapsed
  //};
  ///* PUBLIC API */
  //fireCustomEvent(kEVENT_TYPE_TAB_COLLAPSED_STATE_CHANGED, aTab, true, false, data);

  if (aParams.collapsed && isActive(aTab)) {
    let newSelection = parent;
    for (let ancestor of getAncestorTabs(aTab)) {
      if (isCollapsed(ancestor))
        continue;
      newSelection = ancestor;
      break;
    }
    log('current tab is going to be collapsed, switch to ', dumpTab(newSelection));
    selectTabInternally(newSelection);
  }

  if (!isSubtreeCollapsed(aTab)) {
    for (let tab of getChildTabs(aTab)) {
      collapseExpandTab(tab, {
        collapsed: aParams.collapsed,
        justNow:   aParams.justNow
      });
    }
  }
}

function collapseExpandTreesIntelligentlyFor(aTab, aOptions = {}) {
  if (!aTab)
    return;

  log('collapseExpandTreesIntelligentlyFor');
  var container = getTabsContainer(aTab);
  if (container.doingCollapseExpandCount > 0) {
    //log('=> done by others');
    return;
  }

  var sameParentTab = getParentTab(aTab);
  var expandedAncestors = `<${[aTab].concat(getAncestorTabs(aTab))
      .map(aAncestor => aAncestor.id)
      .join('><')}>`;

  var xpathResult = evaluateXPath(
      `child::${kXPATH_LIVE_TAB}[
        @${kCHILDREN} and
        not(${hasClass(kTAB_STATE_COLLAPSED)}) and
        not(${hasClass(kTAB_STATE_SUBTREE_COLLAPSED)}) and
        not(contains("${expandedAncestors}", concat("<", @id, ">"))) and
        not(${hasClass(kTAB_STATE_HIDDEN)})
      ]`,
      container
    );
  //log(`${xpathResult.snapshotLength} tabs can be collapsed`);
  for (let i = 0, maxi = xpathResult.snapshotLength; i < maxi; i++) {
    let dontCollapse = false;
    let collapseTab  = xpathResult.snapshotItem(i);
    let parentTab = getParentTab(collapseTab);
    if (parentTab) {
      dontCollapse = true;
      if (!isSubtreeCollapsed(parentTab)) {
        for (let ancestor of getAncestorTabs(collapseTab)) {
          if (expandedAncestors.indexOf(`<${ancestor.id}>`) < 0)
            continue;
          dontCollapse = false;
          break;
        }
      }
    }
    //log(`${dumpTab(collapseTab)}: dontCollapse = ${dontCollapse}`);

    let manuallyExpanded = collapseTab.classList.contains(kTAB_STATE_SUBTREE_EXPANDED_MANUALLY);
    if (!dontCollapse && !manuallyExpanded)
      collapseExpandSubtree(collapseTab, clone(aOptions, {
        collapsed: true
      }));
  }

  collapseExpandSubtree(aTab, clone(aOptions, {
    collapsed: false
  }));
}

async function forceExpandTabs(aTabs) {
  var collapsedStates = aTabs.map(isSubtreeCollapsed);
  await Promise.all(aTabs.map(aTab => {
    collapseExpandSubtree(aTab, { collapsed: false, justNow: true });
    collapseExpandTab(aTab, { collapsed: false, justNow: true });
  }));
  return collapsedStates;
}


// operate tabs based on tree information

function closeChildTabs(aParent) {
  var tabs = getDescendantTabs(aParent);
  //if (!fireTabSubtreeClosingEvent(aParent, tabs))
  //  return;

  //markAsClosedSet([aParent].concat(tabs));
  tabs.reverse().forEach(aTab => {
    browser.tabs.remove(aTab.apiTab.id)
      .catch(handleMissingTabError);
  });
  //fireTabSubtreeClosedEvent(aParent, tabs);
}

async function tryMoveFocusFromClosingCurrentTab(aTab) {
  log('tryMoveFocusFromClosingCurrentTab');
  var nextFocusedTab = null;

  var closeParentBehavior = getCloseParentBehaviorForTab(aTab);
  var firstChild = getFirstChildTab(aTab);
  if (firstChild &&
      (closeParentBehavior == kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN ||
       closeParentBehavior == kCLOSE_PARENT_BEHAVIOR_PROMOTE_FIRST_CHILD))
    nextFocusedTab = firstChild;
  log('focus to first child?: ', !!nextFocusedTab);

  var toBeClosedTabs = []; // collectNeedlessGroupTabs(aTab);
  var parentTab = getParentTab(aTab);
  if (parentTab) {
    if (!nextFocusedTab && aTab == getLastChildTab(parentTab)) {
      if (aTab == getFirstChildTab(parentTab)) { // this is the really last child
        nextFocusedTab = parentTab;
        log('focus to parent?: ', !!nextFocusedTab);
      }
      else {
        nextFocusedTab = getPreviousSiblingTab(aTab);
        log('focus to previous sibling?: ', !!nextFocusedTab);
      }
    }
    if (nextFocusedTab && toBeClosedTabs.indexOf(nextFocusedTab) > -1)
      nextFocusedTab = getNextFocusedTab(parentTab);
  }
  else if (!nextFocusedTab) {
    nextFocusedTab = getNextFocusedTab(aTab);
    log('focus to getNextFocusedTab()?: ', !!nextFocusedTab);
  }
  if (nextFocusedTab && toBeClosedTabs.indexOf(nextFocusedTab) > -1) {
    nextFocusedTab = getNextFocusedTab(nextFocusedTab);
    log('focus to getNextFocusedTab() again?: ', !!nextFocusedTab);
  }

  if (!nextFocusedTab || isHidden(nextFocusedTab))
    return false;

  log('focus to: ', dumpTab(nextFocusedTab));

  //XXX notify kEVENT_TYPE_FOCUS_NEXT_TAB for others
  //if (!canFocus)
  //  return;

  nextFocusedTab.parentNode.focusChangedByCurrentTabRemove = true;
  await selectTabInternally(nextFocusedTab);
  return true;
}

function getCloseParentBehaviorForTab(aTab, aDefaultBehavior) {
  if (isSubtreeCollapsed(aTab))
    return kCLOSE_PARENT_BEHAVIOR_CLOSE_ALL_CHILDREN;

  var closeParentBehavior = configs.closeParentBehavior;
  var closeRootBehavior = configs.closeRootBehavior;

  var parentTab = getParentTab(aTab);
  var behavior = aDefaultBehavior ?
                   aDefaultBehavior :
                 (!parentTab &&
                  closeParentBehavior == kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN) ?
                   closeRootBehavior :
                   closeParentBehavior ;
  // Promote all children to upper level, if this is the last child of the parent.
  // This is similar to "taking by representation".
  if (behavior == kCLOSE_PARENT_BEHAVIOR_PROMOTE_FIRST_CHILD &&
      parentTab &&
      getChildTabs(parentTab).length == 1 &&
      configs.closeParentBehaviorPromoteAllChildrenWhenParentIsLastChild)
    behavior = kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN;

  return behavior;
}


async function moveTabSubtreeBefore(aTab, aNextTab, aOptions = {}) {
  if (!aTab ||
      isAllTabsPlacedBefore([aTab].concat(getDescendantTabs(aTab)), aNextTab))
    return;

  var container = aTab.parentNode;
  container.subTreeMovingCount++;
  try {
    await moveTabInternallyBefore(aTab, aNextTab, aOptions);
    await followDescendantsToMovedRoot(aTab, aOptions);
  }
  catch(e) {
    log(`failed to move subtree: ${String(e)}`);
  }
  await wait(0);
  container.subTreeMovingCount--;
}

async function moveTabSubtreeAfter(aTab, aPreviousTab, aOptions = {}) {
  if (!aTab ||
      isAllTabsPlacedAfter([aTab].concat(getDescendantTabs(aTab)), aPreviousTab))
    return;

  var container = aTab.parentNode;
  container.subTreeMovingCount++;
  try {
    await moveTabInternallyAfter(aTab, aPreviousTab, aOptions);
    await followDescendantsToMovedRoot(aTab, aOptions);
  }
  catch(e) {
    log(`failed to move subtree: ${String(e)}`);
  }
  await wait(0);
  container.subTreeMovingCount--;
}

async function followDescendantsToMovedRoot(aTab, aOptions = {}) {
  if (!hasChildTabs(aTab))
    return;

  log('followDescendantsToMovedRoot: ', dumpTab(aTab));
  var container = aTab.parentNode;
  container.subTreeChildrenMovingCount++;
  container.subTreeMovingCount++;
  await moveTabsInternallyAfter(getDescendantTabs(aTab), aTab, aOptions);
  container.subTreeChildrenMovingCount--;
  container.subTreeMovingCount--;
}

async function moveTabs(aTabs, aOptions = {}) {
  if (aTabs.length == 0)
    return [];

  log('moveTabs: ', aTabs.map(dumpTab), aOptions);

  var windowId = aTabs[0].parentNode.windowId || gTargetWindow;
  var destinationWindowId = aOptions.destinationWindowId || gTargetWindow;

  if (aOptions.inRemote) {
    let response = await browser.runtime.sendMessage(clone(aOptions, {
      type:         kCOMMAND_MOVE_TABS,
      windowId:     windowId,
      tabs:         aTabs.map(aTab => aTab.id),
      insertBefore: aParams.insertBefore && aParams.insertBefore.id,
      insertAfter:  aParams.insertAfter && aParams.insertAfter.id,
      duplicate:    !!aOptions.duplicate,
      destinationWindowId: destinationWindowId
    }));
    let movedTabs = response.movedTabs || [];
    return movedTabs.map(getTabById).filter(aTab => !!aTab);
  }

  var movedTabs = aTabs;

  var structure = getTreeStructureFromTabs(aTabs);
  log('structure: ', structure);

  log('preparing container');
  var container = getTabsContainer(destinationWindowId);
  if (!container) {
    container = buildTabsContainerFor(destinationWindowId);
    gAllTabs.appendChild(container);
  }

  if (windowId != destinationWindowId ||
      aOptions.duplicate) {
    //blockUserOperationsIn(windowId);

    container.toBeOpenedTabsWithPositionsCount += aTabs.length;
    container.toBeOpenedOrphanTabs += aTabs.length;
    if (aOptions.duplicate) {
      let sourceContainer = aTabs[0].parentNode;
      sourceContainer.toBeOpenedTabsWithPositionsCount += aTabs.length;
      sourceContainer.toBeOpenedOrphanTabs += aTabs.length;
    }

    log('preparing tabs');
    let offset = getAllTabs(container).length;
    let movedApiTabs = await Promise.all(aTabs.map(async (aTab, aIndex) => {
      let tabId = aTab.apiTab.id;
      if (aOptions.duplicate) {
        let tab = await browser.tabs.duplicate(tabId);
        tabId = tab.id;
      }
      let movedTabs = await browser.tabs.move(tabId, {
        windowId: destinationWindowId,
        index:    aIndex + offset
      });
      return movedTabs[0];
    }));
    log('moved: ', movedApiTabs);

    log('applying tree structure');
    // wait until tabs.onCreated are processed (for safety)
    let newTabs;
    let retryUntil = 10;
    while (retryUntil >= 0) {
      newTabs = movedApiTabs.map(aApiTab => getTabById({
                 tab:    aApiTab.id,
                 window: destinationWindowId
                })).filter(aTab => !!aTab);
      if (newTabs.length < aTabs.length) {
        log('retryling: ', newTabs.length, aTabs.length);
        retryUntil--;
        await wait(100);
        continue;
      }
      applyTreeStructureToTabs(newTabs, structure);
      break;
    }

    //unblockUserOperationsIn(windowId);

    if (!newTabs) {
      log('failed to move tabs (timeout)');
      newTabs = [];
    }
    movedTabs = newTabs;
  }

  if (aOptions.insertBefore &&
      !isAllTabsPlacedBefore(movedTabs, aOptions.insertBefore))
    await moveTabsInternallyAfter(movedTabs, aOptions.insertBefore, aOptions);
  else if (aOptions.insertAfter &&
           !isAllTabsPlacedAfter(movedTabs, aOptions.insertAfter))
    await moveTabsInternallyAfter(movedTabs, aOptions.insertAfter, aOptions);
  else
    log('no move: just duplicate or import');

  return movedTabs;
}

async function openNewWindowFromTabs(aTabs, aOptions = {}) {
  if (aTabs.length == 0)
    return [];

  log('openNewWindowFromTabs: ', aTabs.map(dumpTab), aOptions);

  var windowId = aTabs[0].parentNode.windowId || gTargetWindow;

  if (aOptions.inRemote) {
    let response = await browser.runtime.sendMessage(clone(aOptions, {
      type:         kCOMMAND_NEW_WINDOW_FROM_TABS,
      windowId:     windowId,
      tabs:         aTabs.map(aTab => aTab.id),
      duplicate:    !!aOptions.duplicate,
      left:         'left' in aOptions ? parseInt(aOptions.left) : null,
      top:          'top' in aOptions ? parseInt(aOptions.top) : null
    }));
    let movedTabs = response.movedTabs || [];
    return movedTabs.map(getTabById).filter(aTab => !!aTab);
  }

  log('opening new window');
  var windowParams = {
    //focused: true  // not supported in Firefox...
  };
  if ('left' in aOptions && aOptions.left !== null)
    windowParams.left = aOptions.left;
  if ('top' in aOptions && aOptions.top !== null)
    windowParams.top = aOptions.top;
  var newWindow = await browser.windows.create(windowParams);
  log('new window: ', newWindow);

  var movedTabs = await moveTabs(aTabs, clone(aOptions, {
                          destinationWindowId: newWindow.id
                        }));

  log('closing needless tab');
  browser.windows.get(newWindow.id, { populate: true })
    .then(aApiWindow => {
      browser.tabs.remove(aApiWindow.tabs[0].id);
    });

  return movedTabs;
}


// drag and drop helper

async function performTabsDragDrop(aParams = {}) {
  var windowId = aParams.windowId || gTargetWindow;
  var destinationWindowId = aParams.destinationWindowId || windowId;

  if (aParams.inRemote) {
    browser.runtime.sendMessage(clone(aParams, {
      type:         kCOMMAND_PERFORM_TABS_DRAG_DROP,
      windowId:     windowId,
      attachTo:     aParams.attachTo && aParams.attachTo.id,
      insertBefore: aParams.insertBefore && aParams.insertBefore.id,
      insertAfter:  aParams.insertAfter && aParams.insertAfter.id,
      destinationWindowId,
      inRemote: false
    }));
    return;
  }

  log('performTabsDragDrop ', {
    tabIds: aParams.tabIds,
    windowId: aParams.windowId,
    destinationWindowId: aParams.destinationWindowId,
    action: aParams.action
  });

  var draggedTabs = aParams.tabIds.map(aTabId => getTabById({
                      tab:    aTabId,
                      window: windowId
                    })).filter(aTab => !!aTab);
  if (!draggedTabs.length)
    return;

  var draggedRoots = collectRootTabs(draggedTabs);
  var targetTabs = getTabs(windowId);

  var draggedWholeTree = [].concat(draggedRoots);
  for (let draggedRoot of draggedRoots) {
    let descendants = getDescendantTabs(draggedRoot);
    for (let descendant of descendants) {
      if (draggedWholeTree.indexOf(descendant) < 0)
        draggedWholeTree.push(descendant);
    }
  }
  log('=> draggedTabs: ', draggedTabs.map(dumpTab).join(' / '));

  var selectedTabs = draggedTabs.filter(isSelected);
  if (draggedWholeTree.length != selectedTabs.length &&
      selectedTabs.length > 0) {
    log('=> partially dragged');
    draggedTabs = draggedRoots = selectedTabs;
    if (!aParams.duplicate)
      detachParent(selectedTabs);
  }

  while (aParams.insertBefore &&
         draggedWholeTree.indexOf(aParams.insertBefore) > -1) {
    aParams.insertBefore = getNextTab(aParams.insertBefore);
  }
  while (aParams.insertAfter &&
         draggedWholeTree.indexOf(aParams.insertAfter) > -1) {
    aParams.insertAfter = getPreviousTab(aParams.insertAfter);
  }

  if (aParams.duplicate ||
      windowId != destinationWindowId) {
    draggedTabs = await moveTabs(draggedTabs, {
      destinationWindowId,
      duplicate:    aParams.duplicate,
      insertBefore: aParams.insertBefore,
      insertAfter:  aParams.insertAfter
    });
    draggedRoots = collectRootTabs(draggedTabs);
  }

  log('try attach/detach');
  if (aParams.action & kACTION_DETACH) {
    log('=> detach');
    detachTabsOnDrop(draggedRoots, {
      broadcast: true
    });
  }
  else if (aParams.action & kACTION_ATTACH &&
           aParams.attachTo) {
    log('=> attach');
    attachTabsOnDrop(draggedRoots, aParams.attachTo, {
      insertBefore: aParams.insertBefore,
      insertAfter:  aParams.insertAfter,
      broadcast: true
    });
  }
  else {
    log('=> just moved');
  }

  log('=> moving dragged tabs');
  if (aParams.insertBefore &&
      !isAllTabsPlacedBefore(draggedTabs, aParams.insertBefore))
    await moveTabsInternallyBefore(draggedTabs, aParams.insertBefore);
  else if (aParams.insertAfter &&
           !isAllTabsPlacedAfter(draggedTabs, aParams.insertAfter))
    await moveTabsInternallyAfter(draggedTabs, aParams.insertAfter);
  else
    log('=> already placed at expected position');

  var treeStructure = getTreeStructureFromTabs(draggedTabs);

  var newTabs;
/*
  var replacedGroupTabs = doAndGetNewTabs(() => {
    newTabs = moveTabsInternal(draggedTabs, {
      duplicate    : aParams.action & kACTION_DUPLICATE,
      insertBefore : aParams.insertBefore,
      insertAfter  : aParams.insertAfter,
      inRemote     : true
    });
  });
  log('=> opened group tabs: ', replacedGroupTabs);
  aParams.draggedTab.ownerDocument.defaultView.setTimeout(() => {
    log('closing needless group tabs');
    replacedGroupTabs.reverse().forEach(function(aTab) {
      log(' check: ', aTab.label+'('+aTab._tPos+') '+getLoadingURI(aTab));
      if (isGroupTab(aTab) &&
        !hasChildTabs(aTab))
        removeTab(aTab);
    }, this);
  }, 0);
*/

/*
  if (newTabs.length && aParams.action & kACTION_ATTACH) {
    Promise.all(newTabs.map((aTab) => aTab.__treestyletab__promisedDuplicatedTab))
      .then((function() {
        log('   => attach (last)');
        await attachTabsOnDrop(
          newTabs.filter(function(aTab, aIndex) {
            return treeStructure[aIndex] == -1;
          }),
          aParams.attachTo,
          { insertBefore: aParams.insertBefore,
            insertAfter:  aParams.insertAfter }
        );
      }).bind(this));
  }
*/

  log('=> finished');
}

function attachTabsOnDrop(aTabs, aParent, aOptions = {}) {
  log('attachTabsOnDrop: start');
  for (let tab of aTabs) {
    if (aParent)
      attachTabTo(tab, aParent, aOptions);
    else
      detachTab(tab, aOptions);
    collapseExpandTab(tab, clone(aOptions, {
      collapsed: false
    }));
  }
}

function detachTabsOnDrop(aTabs, aOptions = {}) {
  log('detachTabsOnDrop: start');
  for (let tab of aTabs) {
    detachTab(tab, aOptions);
    collapseExpandTab(tab, clone(aOptions, {
      collapsed: false
    }));
  }
}


// set/get tree structure

function getTreeStructureFromTabs(aTabs) {
  if (!aTabs || !aTabs.length)
    return [];

  /* this returns...
    [A]     => -1 (parent is not in this tree)
      [B]   => 0 (parent is 1st item in this tree)
      [C]   => 0 (parent is 1st item in this tree)
        [D] => 2 (parent is 2nd in this tree)
    [E]     => -1 (parent is not in this tree, and this creates another tree)
      [F]   => 0 (parent is 1st item in this another tree)
  */
  return cleanUpTreeStructureArray(
      aTabs.map((aTab, aIndex) => {
        let tab = getParentTab(aTab);
        let index = tab ? aTabs.indexOf(tab) : -1 ;
        return index >= aIndex ? -1 : index ;
      }),
      -1
    ).map((aParentIndex, aIndex) => {
      return {
        parent:    aParentIndex,
        collapsed: isSubtreeCollapsed(aTabs[aIndex])
      };
    });
}
function cleanUpTreeStructureArray(aTreeStructure, aDefaultParent) {
  var offset = 0;
  aTreeStructure = aTreeStructure
    .map((aPosition, aIndex) => {
      return (aPosition == aIndex) ? -1 : aPosition ;
    })
    .map((aPosition, aIndex) => {
      if (aPosition == -1) {
        offset = aIndex;
        return aPosition;
      }
      return aPosition - offset;
    });

  /* The final step, this validates all of values.
     Smaller than -1 is invalid, so it becomes to -1. */
  aTreeStructure = aTreeStructure.map(aIndex => {
      return aIndex < -1 ? aDefaultParent : aIndex ;
    });
  return aTreeStructure;
}

async function applyTreeStructureToTabs(aTabs, aTreeStructure, aExpandStates = []) {
  log('applyTreeStructureToTabs: ', aTabs.map(dumpTab), aTreeStructure, aExpandStates);
  aTabs = aTabs.slice(0, aTreeStructure.length);
  aTreeStructure = aTreeStructure.slice(0, aTabs.length);

  aExpandStates = (aExpandStates && typeof aExpandStates == 'object') ?
            aExpandStates :
            aTabs.map(aTab => !!aExpandStates);
  aExpandStates = aExpandStates.slice(0, aTabs.length);
  while (aExpandStates.length < aTabs.length)
    aExpandStates.push(-1);

  var parentTab = null;
  for (let i = 0, maxi = aTabs.length; i < maxi; i++) {
    let tab = aTabs[i];
/*
    if (isCollapsed(tab))
      collapseExpandTab(tab, {
        collapsed: false,
        justNow: true
      });
*/
    detachTab(tab, { justNow: true });

    let structureInfo = aTreeStructure[i];
    let parentIndexInTree = -1;
    if (typeof structureInfo == 'number') { // legacy format
      parentIndexInTree = structureInfo;
    }
    else {
      parentIndexInTree = structureInfo.parent;
      aExpandStates[i]  = !structureInfo.collapsed;
    }
    if (parentIndexInTree < 0) // there is no parent, so this is a new parent!
      parentTab = tab.id;

    let parent = getTabById(parentTab);
    if (parent) {
      let tabs = [parent].concat(getDescendantTabs(parent));
      //log('existing tabs in tree: ', {
      //  size: tabs.length,
      //  parent: parentIndexInTree
      //});
      parent = parentIndexInTree < tabs.length ? tabs[parentIndexInTree] : parent ;
    }
    if (parent) {
      attachTabTo(tab, parent, {
        dontExpand : true,
        dontMove   : true,
        justNow    : true
      });
    }
  }

  log('aExpandStates: ', aExpandStates);
  for (let i = aTabs.length-1; i > -1; i--) {
    let tab = aTabs[i];
    let expanded = aExpandStates[i];
    collapseExpandSubtree(tab, {
      collapsed: expanded === undefined ? !hasChildTabs(tab) : !expanded ,
      justNow:   true
    });
  }
}


function scrollToNewTab(aTab) {
}

function updateInsertionPositionInfo(aTab) {
}


function getDroppedLinksOnTabBehavior() {
  return kDROPLINK_NEWTAB;
/*
  var behavior = utils.getTreePref('dropLinksOnTab.behavior');
  if (behavior & this.kDROPLINK_FIXED)
    return behavior;

  var checked = { value : false };
  var newChildTab = Services.prompt.confirmEx(this.browserWindow,
      utils.treeBundle.getString('dropLinkOnTab.title'),
      utils.treeBundle.getString('dropLinkOnTab.text'),
      (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) +
      (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1),
      utils.treeBundle.getString('dropLinkOnTab.openNewChildTab'),
      utils.treeBundle.getString('dropLinkOnTab.loadInTheTab'),
      null,
      utils.treeBundle.getString('dropLinkOnTab.never'),
      checked
    ) == 0;

  behavior = newChildTab ? this.kDROPLINK_NEWTAB : this.kDROPLINK_LOAD ;
  if (checked.value)
    utils.setTreePref('dropLinksOnTab.behavior', behavior);

  return behavior
*/
}

function openGroupBookmarkBehavior() {
  return kGROUP_BOOKMARK_SUBTREE | kGROUP_BOOKMARK_USE_DUMMY | kGROUP_BOOKMARK_EXPAND_ALL_TREE;
/*
  var behavior = utils.getTreePref('openGroupBookmark.behavior');
  if (behavior & this.kGROUP_BOOKMARK_FIXED)
    return behavior;

  var dummyTabFlag = behavior & this.kGROUP_BOOKMARK_USE_DUMMY;

  var checked = { value : false };
  var button = Services.prompt.confirmEx(this.browserWindow,
      utils.treeBundle.getString('openGroupBookmarkBehavior.title'),
      utils.treeBundle.getString('openGroupBookmarkBehavior.text'),
      // The "cancel" button must pe placed as the second button
      // due to the bug: https://bugzilla.mozilla.org/show_bug.cgi?id=345067
      (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) |
      (Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1) |
      (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_2),
      utils.treeBundle.getString('openGroupBookmarkBehavior.subTree'),
      '',
      utils.treeBundle.getString('openGroupBookmarkBehavior.separate'),
      utils.treeBundle.getString('openGroupBookmarkBehavior.never'),
      checked
    );

  if (button < 0)
    return this.kGROUP_BOOKMARK_CANCEL;

  var behaviors = [
      this.kGROUP_BOOKMARK_SUBTREE | dummyTabFlag,
      this.kGROUP_BOOKMARK_CANCEL,
      this.kGROUP_BOOKMARK_SEPARATE
    ];
  behavior = behaviors[button];

  if (checked.value && button != this.kGROUP_BOOKMARK_CANCEL) {
    utils.setTreePref('openGroupBookmark.behavior', behavior);
  }
  return behavior;
*/
}
