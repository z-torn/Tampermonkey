// ==UserScript==
// @name         Torn User List Extender
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add rank to user list display
// @author       xedx
// @include      https://www.torn.com/userlist.php*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function($) {
    'use strict';

    // Global cache of ID->Rank associations
    var rank_cache = ['', 0];

    //////////////////////////////////////////////////////////////////////
    // Query profile information based on ID
    //////////////////////////////////////////////////////////////////////

    var totalRequests = 0;
    function getRankFromId(ID, index) {
        var details = GM_xmlhttpRequest({
            method:"POST",
            url:"https://api.torn.com/user/" + ID + "?selections=profile&key=" + api_key,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            onload: function(response) {
                updateUserLevelsCB(response.responseText, index, ID);
            },
            onerror: function(response) {
                handleRankError(response.responseText);
            }
        });
        totalRequests++;
    }

    //////////////////////////////////////////////////////////////////////
    // Very simple error handler; only displayed (and logged) once
    //////////////////////////////////////////////////////////////////////

    var errorLogged = false;
    function handleRankError(responseText) {
        if (!errorLogged) {
            var jsonResp = JSON.parse(responseText);
            var errorText = 'An error has occurred querying rank information.\n' +
                '\nCode: ' + jsonResp.error.code +
                '\nError: ' + jsonResp.error.error;

            if (jsonResp.error.code == 5) {
                errorText += '\n\n The Torn API only allows so many requests per minute. ' +
                    'If this limit is exceeded, this error will occur. It will clear itself' +
                    'up shortly, or you may try refreshing the page.\n';
            }

            errorText += '\nPress OK to continue.';
            alert(errorText);
            console.log(errorText);
            errorLogged = true;
        }
    }

    //////////////////////////////////////////////////////////////////////
    // This callback create the cache used to store ID-rank associations.
    // This is done because if we edit the LI text here, we'll trigger
    // the MutationObserver again. Once the iteration is complete that
    // in turn triggers profile lookups (which callback to here), we
    // can disconnect the observer and perform the modifications, using
    // the cache to get the values we need.
    //////////////////////////////////////////////////////////////////////

    var totalResponses = 0;
    function updateUserLevelsCB(responseText, index, ID) {
        totalResponses++;
        var jsonResp = JSON.parse(responseText);

        if (jsonResp.error) {
            return handleRankError(responseText);
        }

        var fullRank = jsonResp.rank;
        var parts = fullRank.split(' ');
        var rank = parts[0];
        if (parts.length >= 3 &&
            (rank == 'Absolute' || rank == 'Below' || rank == 'Above' || rank == 'Highly')) {
            rank = rank + ' ' + parts[1];
        }

        // Lookup name in our table (array) to convert to number
        var numeric_rank = 0;
        for (var i = 0; i < ranks.length; i++) {
            if (rank == ranks[i]) {
                numeric_rank = i;
                break;
            }
        }

        var cacheEntry = [ID, numeric_rank];
        rank_cache.push(cacheEntry);

        // If we have received all responses, we can trigger the
        // actual UI update.
        if (totalRequests == totalResponses) {
            updateUserLevelsUI();
        }
    }

    //////////////////////////////////////////////////////////////////////
    // Find a rank from our cache, based on ID
    //////////////////////////////////////////////////////////////////////

    function getCachedRankFromId(ID) {
        for (var i = 0; i < rank_cache.length; i++) {
            if (rank_cache[i][0] == ID) {
                return rank_cache[i][1];
            }
        }
        return 0; // Not found!
    }

    //////////////////////////////////////////////////////////////////////
    // This actually updates the UI - it finds the rank associated
    // with an ID from our cache and updates.
    //////////////////////////////////////////////////////////////////////

    function updateUserLevelsUI() {
        var elemList = document.getElementsByClassName('user-info-list-wrap bottom-round cont-gray');
        var ul = elemList[0];
        var items = ul.getElementsByTagName("li");

        for (var i = 0; i < items.length; ++i) {
            var li = items[i];
            var ID;

            try {
                ID = items[i].getElementsByClassName('user name')[0].getAttribute("href").split("=")[1];
            } catch(err) {
                continue;
            }

            var level;
            try {
                level = items[i].getElementsByClassName('level')[0].getElementsByClassName('value')[0];
            } catch(err) {
                continue;
            }

            var numeric_rank = getCachedRankFromId(ID);
            level.innerHTML = level.innerHTML + '/' + (numeric_rank ? numeric_rank : '?');
        }

        // Re-connect our observer, in preparation for going to another page.
        totalRequests = totalResponses = 0;
        observer.observe(targetNode, config);
    }

    //////////////////////////////////////////////////////////////////////
    // This prepares to update the UI by locating level, user ID
    // and the index of the <li> in the <ul>.
    //////////////////////////////////////////////////////////////////////

    function updateUserLevels() {
        // Get the <UL>
        var elemList = document.getElementsByClassName('user-info-list-wrap bottom-round cont-gray');
        var items;
        try {
            items = elemList[0].getElementsByTagName("li")
        } catch(err) {
            return;
        }

        // We seem to be called twice, the first call always has a length of 1.
        // It seems we can ignore this call.
        //console.log("<LI> Items detected: " + items.length);
        if (items.length <= 1) {
            return;
        }

        for (var i = 0; i < items.length; ++i) {
            // Get user ID, to look up rank
            var ID;
            try {
                ID = items[i].getElementsByClassName('user name')[0].getAttribute("href").split("=")[1];
            } catch(err) {
                continue;
            }

            if (!getCachedRankFromId(ID)) {
                getRankFromId(ID, i);
            }
        }

        // We're done iterating. We can disconnect the observer now, since
        // we don't want to be called while updating the <li>'s.
        // We are expecting 'totalQueries' responses.
        observer.disconnect();
    }

    //////////////////////////////////////////////////////////////////////
    // Map textual rank names to numeric, via array index
    //////////////////////////////////////////////////////////////////////

    var ranks = ['Absolute beginner',
                 'Beginner',
                 'Inexperienced',
                 'Rookie',
                 'Novice',
                 'Below average',
                 'Average',
                 'Reasonable',
                 'Above average',
                 'Competent',
                 'Highly competent',
                 'Veteran',
                 'Distinguished',
                 'Highly distinguished',
                 'Professional',
                 'Star',
                 'Master',
                 'Outstanding',
                 'Celebrity',
                 'Supreme',
                 'Idolised',
                 'Champion',
                 'Heroic',
                 'Legendary',
                 'Elite',
                 'Invincible'];

    //////////////////////////////////////////////////////////////////////
    // Main. Using a MutationObserver allows us to be notified
    // whenever the root of the 'User List' section (the
    // <div id="mainContainer"> section) changes/updates. Note
    // that this is likely triggered at the addition of each <li>,
    // and we'll need to keep track of what has already been edited.
    //////////////////////////////////////////////////////////////////////

    console.log("User List Extender script started!");

    // Make sure we have an API key
    var api_key = GM_getValue('gm_api_key');
    if (api_key == null || api_key == 'undefined' || typeof api_key === 'undefined' || api_key == '') {
        api_key = prompt("Please enter your API key.\n" +
                         "Your key will be saved locally so you won't have to be asked again.\n" +
                         "Your key is kept private and not shared with anyone.", "");
        GM_setValue('gm_api_key', api_key);
    }

    var targetNode = document.getElementById('mainContainer');
    var config = { attributes: false, childList: true, subtree: true };
    var callback = function(mutationsList, observer) {
        //console.log('Mutation observer triggered.');
        //console.log('mutation.type = ' + mutationsList[0].type);
        updateUserLevels();
    };
    var observer = new MutationObserver(callback);
    observer.observe(targetNode, config);

})();