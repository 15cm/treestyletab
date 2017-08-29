/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

const kCOMMAND_PULL_TREE_STRUCTURE = 'treestyletab:pull-tree-structure';
const kCOMMAND_PUSH_TREE_STRUCTURE = 'treestyletab:push-tree-structure';
const kCOMMAND_CHANGE_SUBTREE_COLLAPSED_STATE = 'treestyletab:change-subtree-collapsed-state';
const kCOMMAND_SELECT_TAB = 'treestyletab:request-select-tab';
const kCOMMAND_SELECT_TAB_INTERNALLY = 'treestyletab:request-select-tab-internally';
const kCOMMAND_SET_SUBTREE_MUTED = 'treestyletab:set-subtree-muted';
const kCOMMAND_REMOVE_TAB = 'treestyletab:request-remove-tab';
const kCOMMAND_NEW_TABS = 'treestyletab:request-new-tabs';
const kCOMMAND_ATTACH_TAB_TO = 'treestyletab:request-attach-tab-to';
const kCOMMAND_DETACH_TAB = 'treestyletab:request-detach-tab';
const kCOMMAND_MOVE_TABS_INTERNALLY_BEFORE = 'treestyletab:request-move-tabs-internally-before';
const kCOMMAND_MOVE_TABS_INTERNALLY_AFTER = 'treestyletab:request-move-tabs-internally-after';
const kCOMMAND_LOAD_URI = 'treestyletab:request-load-uri';
const kCOMMAND_NEW_WINDOW_FROM_TABS = 'treestyletab:request-new-window-from-tabs';
const kCOMMAND_MOVE_TABS = 'treestyletab:request-move-tabs';
const kCOMMAND_PERFORM_TABS_DRAG_DROP = 'treestyletab:request-perform-tabs-drag-drop';
const kCOMMAND_BLOCK_USER_OPERATIONS = 'treestyletab:request-block-user-operations';
const kCOMMAND_UNBLOCK_USER_OPERATIONS = 'treestyletab:request-unblock-user-operations';
const kCOMMAND_BROADCAST_TAB_STATE = 'treestyletab:broadcast-tab-state';

const kCONTENT_LOCATION = 'data-content-location';
const kPARENT   = 'data-parent-id';
const kCHILDREN = 'data-child-ids';
const kANCESTORS = 'data-ancestor-ids';
const kNEST     = 'data-nest';
const kINSERT_BEFORE = 'data-insert-before-id';
const kINSERT_AFTER  = 'data-insert-after-id';
const kCLOSED_SET_ID = 'data-closed-set-id';
const kTWISTY_STYLE = 'data-twisty-style';
const kDROP_POSITION = 'data-drop-position';

const kFAVICON  = 'favicon';
const kFAVICON_IMAGE = 'favicon-image';
const kFAVICON_DEFAULT = 'favicon-default';
const kTHROBBER = 'throbber';
const kSOUND_BUTTON = 'sound-button';
const kTWISTY   = 'twisty';
const kLABEL    = 'label';
const kCOUNTER  = 'counter';
const kCLOSEBOX = 'closebox';
const kNEWTAB_BUTTON = 'newtab-button';

const kTAB_STATE_ACTIVE = 'active';
const kTAB_STATE_PINNED = 'pinned';
const kTAB_STATE_AUDIBLE = 'audible';
const kTAB_STATE_SOUND_PLAYING = 'sound-playing';
const kTAB_STATE_HAS_SOUND_PLAYING_MEMBER = 'has-sound-playing-member';
const kTAB_STATE_MUTED = 'muted';
const kTAB_STATE_HAS_MUTED_MEMBER = 'has-muted-member';
const kTAB_STATE_HIDDEN = 'hidden';
const kTAB_STATE_ANIMATION_READY = 'animation-ready';
const kTAB_STATE_REMOVING = 'removing';
const kTAB_STATE_COLLAPSED = 'collapsed';
const kTAB_STATE_COLLAPSED_DONE = 'collapsed-completely';
const kTAB_STATE_SUBTREE_COLLAPSED = 'subtree-collapsed';
const kTAB_STATE_SUBTREE_EXPANDED_MANUALLY = 'subtree-expanded-manually';
const kTAB_STATE_FAVICONIZED = 'faviconized';
const kTAB_STATE_UNREAD = 'unread';
const kTAB_STATE_HIGHLIGHTED = 'highlighted';
const kTAB_STATE_SELECTED = 'selected';
const kTAB_STATE_POSSIBLE_CLOSING_CURRENT = 'possible-closing-current';
const kTAB_STATE_DRAGGING = 'dragging';

const kTABBAR_STATE_OVERFLOW = 'overflow';
const kTABBAR_STATE_TAB_DRAGGING = 'tab-dragging';
const kTABBAR_STATE_BLOCKING = 'blocking';

const kCOUNTER_ROLE_ALL_TABS = 1;
const kCOUNTER_ROLE_CONTAINED_TABS = 2;

const kDROP_BEFORE = -1;
const kDROP_ON = 0;
const kDROP_AFTER = 1;

const kACTION_MOVE = 1 << 0;
const kACTION_STAY = 1 << 1;
const kACTION_DUPLICATE = 1 << 2;
const kACTION_IMPORT = 1 << 3;
const kACTION_NEWTAB = 1 << 4;
const kACTION_ATTACH = 1 << 10;
const kACTION_DETACH = 1 << 11;
const kACTION_AFFECTS_TO_SOURCE = (1 << 0) | (1 << 1);
const kACTION_AFFECTS_TO_DESTINATION = (1 << 2) | (1 << 3);

const kDROPLINK_ASK = 0;
const kDROPLINK_LOAD = 1 << 0;
const kDROPLINK_NEWTAB = 1 << 1;
const kDROPLINK_FIXED = kDROPLINK_LOAD | kDROPLINK_NEWTAB;

const kGROUP_BOOKMARK_ASK = 0;
const kGROUP_BOOKMARK_SUBTREE = 1 << 0;
const kGROUP_BOOKMARK_SEPARATE = 1 << 1;
const kGROUP_BOOKMARK_FIXED = kGROUP_BOOKMARK_SUBTREE | kGROUP_BOOKMARK_SEPARATE;
const kGROUP_BOOKMARK_USE_DUMMY = 1 << 8;
const kGROUP_BOOKMARK_USE_DUMMY_FORCE = 1 << 10;
const kGROUP_BOOKMARK_DONT_RESTORE_TREE_STRUCTURE = 1 << 9;
const kGROUP_BOOKMARK_EXPAND_ALL_TREE = 1 << 11;
const kGROUP_BOOKMARK_CANCEL = -1;

const kCLOSE_PARENT_BEHAVIOR_PROMOTE_FIRST_CHILD        = 3;
const kCLOSE_PARENT_BEHAVIOR_PROMOTE_ALL_CHILDREN       = 0;
const kCLOSE_PARENT_BEHAVIOR_DETACH_ALL_CHILDREN        = 1;
const kCLOSE_PARENT_BEHAVIOR_SIMPLY_DETACH_ALL_CHILDREN = 4;
const kCLOSE_PARENT_BEHAVIOR_CLOSE_ALL_CHILDREN         = 2; // onTabRemoved only
const kCLOSE_PARENT_BEHAVIOR_REPLACE_WITH_GROUP_TAB     = 5;

const kINSERT_NO_CONTROL = -1;
const kINSERT_FISRT = 0;
const kINSERT_LAST = 1;

const kDEFAULT_MIN_INDENT = 3;

const kTAB_STATE_GROUP_TAB = 'group-tab';
const kGROUP_TAB_URI = browser.extension.getURL('resources/group-tab.html');
