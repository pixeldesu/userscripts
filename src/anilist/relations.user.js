// ==UserScript==
// @name         Relation Status for AniList
// @namespace    https://github.com/pixeldesu/userscripts/src/anilist/relations.user.js
// @version      1.0.0
// @description  Add list status indicators to relations on media pages on AniList
// @author       pixeldesu
// @match        https://anilist.co/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(async () => {
  /**
   * Debug option, if set to true, console output with helpful debug info will be shown
   */
  const DEBUG = true;

  /**
   * Object containing the localStorage `auth` user authentication data for easier access
   */
  let AUTH = {};

  /**
   * Cache map containing a `mediaId -> status` mapping to prevent repeatedly sending
   * network requests for statuses that already were fetched in-session
   */
  const CACHE = new Map();

  /**
   * Additional styling for the relation status display
   *
   * @remarks This is mostly based on the already existing style, aside the fact that
   * I cant't really use those because they are scoped into the Vue components
   */
  const STYLE = `
    .list-status {
      display: inline-block;
      height: 12px;
      width: 12px;
    }

    .image-text .list-status {
      height: 6px;
      width: 6px;
      margin-right: 4px;
      margin-bottom: 2px;
    }

    .list-status[status="CURRENT"],
    .list-status[status="REPEATING"] {
      background-color: rgb(var(--color-blue));
    }

    .list-status[status="COMPLETED"] {
      background-color: rgb(var(--color-green));
    }

    .list-status[status="PLANNING"] {
      background-color: rgb(var(--color-orange));
    }

    .list-status[status="PAUSED"] {
      background-color: rgb(var(--color-peach));
    }

    .list-status[status="DROPPED"] {
      background-color: rgb(var(--color-red));
    }
  `;

  /**
   * Log method only showing messages if the `DEBUG` constant is set to true
   *
   * @param {*} message message content
   */
  const log = (message) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`[Relations]${message}`);
    }
  };

  /**
   * Method to wait for a HTML element to be present on the site
   *
   * @param {*} selector selector of the element we are waiting for
   * @returns element resolved from `selector`
   *
   * @see https://gist.github.com/jwilson8767/db379026efcbd932f64382db4b02853e
   */
  const onElementReady = (selector) =>
    new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      }
      new MutationObserver((_mutationRecords, observer) => {
        // Query for elements matching the specified selector
        Array.from(document.querySelectorAll(selector)).forEach(() => {
          resolve(document.querySelector(selector));
          // Once we have resolved we don't need the observer anymore.
          observer.disconnect();
        });
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });

  /**
   * Method to wait for a property to exist on a HTML element
   *
   * @param {*} selector selector of the element we expect a property on
   * @param {*} property the property we are waiting for
   * @returns the contents of the property
   */
  const onPropertyReady = (selector, property) =>
    new Promise((resolve) => {
      const interval = setInterval(() => {
        const object = document.querySelector(selector);

        if (object !== null && Object.hasOwn(object, property) && object[property] !== null) {
          log(`[onPropertyReady] property '${property}' found`);
          resolve(object[property]);
          clearInterval(interval);
        } else {
          log(`[onPropertyReady] property '${property}' not found`);
        }
      }, 200);
    });

  /**
   * Method to attach a callback function on Vue Router route changes
   *
   * @param {*} callback method to call after route changes
   */
  const afterRouteChange = async (callback) => {
    onElementReady('#app').then(() => {
      onPropertyReady('#app', '__vue__').then((vueInst) => {
        vueInst._router.afterEach(callback);
      });
    });
  };

  /**
   * Method to add additional styling for the userstyle into the page
   */
  const addStyle = () => {
    if (document.querySelector('style[data-relation-style]') === null) {
      const style = document.createElement('style');
      style.setAttribute('data-relation-style', true);
      style.textContent = STYLE;

      document.head.appendChild(style);
      log(`[addStyle] attached style to <head>`);
    }
  };

  /**
   * Method to get the list status of a given media by ID
   *
   * @param {*} mediaId media ID to get the status for
   * @returns the status of the given media ID
   */
  const getStatusForMediaEntry = async (mediaId) => {
    const query = `
      query($mediaId: Int, $userId: Int) {
        MediaList(mediaId: $mediaId, userId: $userId) {
          status
        }
      }
    `;

    const variables = { mediaId, userId: AUTH.id };
    let status = null;

    if (!CACHE.has(mediaId)) {
      try {
        const response = await fetch('https://graphql.anilist.co/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ query, variables }),
        });
        const { data } = await response.json();

        if (data.MediaList) {
          status = data.MediaList.status;
          log(`[getStatusForMediaEntry] Got status '${status}' for media '${mediaId}'`);
        }
      } catch (e) {
        status = null;
        log(
          `[getStatusForMediaEntry] Network request failed, assuming no list entry exists for '${mediaId}'`
        );
      }

      CACHE.set(mediaId, status);
    } else {
      status = CACHE.get(mediaId);
      log(`[getStatusForMediaEntry] Got list status for '${mediaId}' from cache`);
    }

    return status;
  };

  /**
   * Method to create HTML elements for the status display in relations
   *
   * @param {*} status given status
   * @returns the assembled HTML element
   */
  const createStatusElement = (status) => {
    const element = document.createElement('div');
    element.classList.add('list-status');
    element.classList.add('circle');
    element.setAttribute('status', status);

    return element;
  };

  /**
   * Method to create and attach the status identicators for relation child elements
   *
   * @param {*} childElement
   */
  const setStatusForChild = async (childElement) => {
    const status = await getStatusForMediaEntry(childElement._props.mediaId);
    const childDOMElement = childElement.$el;

    if (status != null) {
      Array.from(childDOMElement.querySelectorAll('.image-text > div,.title')).forEach(
        (titleElement) => {
          titleElement.prepend(createStatusElement(status));
        }
      );
    }
  };

  /**
   * Main method starting most of the relation logic
   */
  const initRelations = () => {
    addStyle();
    AUTH = JSON.parse(localStorage.getItem('auth'));

    onElementReady('.relations').then(() => {
      onPropertyReady('.relations', '__vue__').then((vueInst) => {
        vueInst.$children.forEach(setStatusForChild);
      });
    });
  };

  afterRouteChange((route) => {
    if (route.name === 'MediaOverview') {
      initRelations();
    }
  });

  window.addEventListener('load', () => {
    initRelations();
  });
})();
