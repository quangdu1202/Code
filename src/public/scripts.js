window.dispatchMessages = function (messages, timeout) {
    const container = document.getElementById('notification-container');

    messages.forEach(({type, text}) => {
        const notification = document.createElement('div');
        const inner = document.createElement('span');
        notification.className = 'w-full flex justify-center';
        inner.className = `notification ${type}`;
        inner.innerText = text;
        notification.appendChild(inner);
        container.appendChild(notification);

        notification.addEventListener('click', () => notification.remove());

        if (timeout > 0) {
            setTimeout(() => notification && notification.remove(), timeout);
        }
    });
};

function initSankakuTools() {
    return {
        API_URL: "https://capi-v2.sankakucomplex.com",
        LOGIN_URL: "https://capi-v2.sankakucomplex.com/auth/token",
        TAG_WIKI_URL: "https://capi-v2.sankakucomplex.com/tag-and-wiki/name/",
        FOLLOWING_URL: "https://sankakuapi.com/users/followings?lang=en",
        TAG_SEARCH_AUTO_SUGGEST_CREATING_URL: "https://sankakuapi.com/tags/autosuggestCreating?lang=en&tag=",
        TAG_POSTS_URL: "https://capi-v2.sankakucomplex.com/posts?lang=en",
        POST_FOLLOW_URL: "https://sankakuapi.com/posts/",
        PROXY_HOST: "http://localhost:8000/sig/", // TODO
        isLoading: false,
        loginData: {
            login: '',
            password: ''
        },
        initialized: false,
        token: {
            token_type: '',
            access_token: '',
            refresh_token: '',
            access_token_ttl: 0,  // Token time-to-live in seconds
            refresh_token_ttl: 0,  // Refresh token time-to-live in seconds
            expiry_date: null,     // Access token expiry date
            refresh_expiry_date: null,  // Refresh token expiry date
            hasToken: false,       // Track if token is available
        },
        selectedFile: null,
        tags: [],
        fetchedPostsData: [],
        lastFetchFollowingTagsTime: null,
        sortBy: '', // Current sorting field ('tagName' or 'following')
        sortDesc: false, // Track sorting direction
        selectedTags: [],
        recentlyUnfollowedTags: [],
        selectedAll: false,
        selectedFollowFilter: "all",
        selectedFetchFilter: "all",
        filteredTags: [],
        currentTag: null,
        isShowingTagURL: false,
        currentSearchInputElement: null,
        currentSearchTag: null,
        searchTagSuggestions: [],
        searchTagSuggestionsFetched: false,
        postsPerPage: 20, // Number of posts per page (default 20)
        currentPage: 1, // Track the current page
        totalPages: 1, // Track the total number of pages
        selectedTagToShowPosts: {}, // Selected tag with posts
        isFetchingPosts: false, // Track if posts are being fetched
        isShowingPosts: false, // Track if posts are being shown
        supportedImageTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],

        dispatchMessage(type, message, timeout) {
            window.dispatchMessages([{type: type, text: message}], timeout);
        },

        // Check local storage on init
        init() {
            if (this.initialized) return;
            this.initialized = true;
            const savedToken = localStorage.getItem('skkToken');

            if (savedToken) {
                // Load token details from local storage
                this.token = JSON.parse(savedToken);

                // Check token expiry
                this.checkTokenExpiry();
            }

            // Get all local storage values related to tags
            this.getLocalStorageForTags()

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                this.dispatchMessage("error", "Last fetch was more than 5 minutes ago. You should fetch following tags again.", 5000);
            }
        },

        getLocalStorageForTags() {
            // Get all local storage values related to tags
            const storedLocalTags = localStorage.getItem('localTags');
            if (storedLocalTags) {
                this.tags = JSON.parse(storedLocalTags);
            }

            const storedLastFetchTime = localStorage.getItem('lastFetchFollowingTagsTime');
            if (storedLastFetchTime) {
                this.lastFetchFollowingTagsTime = storedLastFetchTime;
            }

            const storedRecentlyUnfollowedTags = localStorage.getItem('recentlyUnfollowedTags');
            if (storedRecentlyUnfollowedTags) {
                this.recentlyUnfollowedTags = JSON.parse(storedRecentlyUnfollowedTags);
            }

            const storedPostsData = localStorage.getItem('fetchedPostsData');
            if (storedPostsData) {
                this.fetchedPostsData = JSON.parse(storedPostsData);
            }

            this.filteredTags = this.tags
        },

        updateLocalStorageForTags() {
            console.log('Updating fetchedPostsData: ', this.fetchedPostsData);
            // update all local storage values related to tags
            localStorage.setItem('localTags', JSON.stringify(this.tags));
            localStorage.setItem('lastFetchFollowingTagsTime', this.lastFetchFollowingTagsTime);
            localStorage.setItem('recentlyUnfollowedTags', JSON.stringify(this.recentlyUnfollowedTags));
            localStorage.setItem('fetchedPostsData', JSON.stringify(this.fetchedPostsData));
            console.log('Updated local storage for tags');
        },

        getToken() {
            const url = this.LOGIN_URL;
            const options = {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(this.loginData)
            };

            this.isLoading = true;
            fetch(url, options)
                .then((response) => response.json())
                .then(data => {
                    if (data.success && data.token_type && data.access_token && data.refresh_token) {
                        // Store token information
                        Object.assign(this.token, {
                            token_type: data.token_type,
                            access_token: data.access_token,
                            refresh_token: data.refresh_token,
                            access_token_ttl: data.access_token_ttl,
                            refresh_token_ttl: data.refresh_token_ttl,
                            hasToken: true,
                            expiry_date: new Date(Date.now() + data.access_token_ttl * 1000),
                            refresh_expiry_date: new Date(Date.now() + data.refresh_token_ttl * 1000)
                        });

                        // Store token details in localStorage
                        localStorage.setItem('skkToken', JSON.stringify(this.token));
                        this.dispatchMessage("success", "Login successful! Tokens saved.", 3000);
                        this.checkTokenExpiry();
                    } else {
                        this.dispatchMessage("error", "Invalid credentials or unknown error!", 5000);
                    }
                })
                .catch(error => console.error('Error:', error))
                .finally(() => this.isLoading = false);
        },

        checkTokenExpiry() {
            const now = new Date();

            if (this.token.expiry_date) {
                const accessTokenExpiresIn = Math.round((this.token.expiry_date - now) / 1000);
                if (accessTokenExpiresIn <= 0) {
                    this.dispatchMessage("error", "Access token has expired. Please log in again.", 5000);
                    this.token.hasToken = false;
                } else if (accessTokenExpiresIn <= 3600) {
                    this.dispatchMessage("error", `Access token will expire in ${Math.round(accessTokenExpiresIn / 60)} minutes.`, 5000);
                }
            }

            if (this.token.refresh_expiry_date) {
                const refreshTokenExpiresIn = Math.round((this.token.refresh_expiry_date - now) / 1000);
                if (refreshTokenExpiresIn <= 0) {
                    this.dispatchMessage("error", "Refresh token has expired. Please log in again.", 5000);
                    this.token.hasToken = false;
                } else if (refreshTokenExpiresIn <= 86400) {
                    this.dispatchMessage("error", `Refresh token will expire in ${Math.round(refreshTokenExpiresIn / 3600)} hours.`, 5000);
                }
            }
        },

        copyToken() {
            const tokenText = this.$refs.token.textContent;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Use the clipboard API if available
                navigator.clipboard
                    .writeText(tokenText)
                    .then(() => {
                        this.dispatchMessage("success", "Token copied!", 5000);
                    })
                    .catch(err => {
                        console.error('Error copying token: ', err);
                    });
            } else {
                // Fallback approach for unsupported browsers
                const textarea = document.createElement('textarea');
                textarea.value = tokenText;
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    this.dispatchMessage("success", "Token copied!", 5000);
                } catch (err) {
                    console.error('Fallback: Error copying token', err);
                }
                document.body.removeChild(textarea);
            }
        },

        copyRefreshToken() {
            const tokenText = this.$refs.refreshToken.textContent;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Use the clipboard API if available
                navigator.clipboard
                    .writeText(tokenText)
                    .then(() => {
                        this.dispatchMessage("success", "Refresh Token copied!", 5000);
                    })
                    .catch(err => {
                        console.error('Error copying token: ', err);
                    });
            } else {
                // Fallback approach for unsupported browsers
                const textarea = document.createElement('textarea');
                textarea.value = tokenText;
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    this.dispatchMessage("success", "Refresh Token copied!", 5000);
                } catch (err) {
                    console.error('Fallback: Error copying refresh token', err);
                }
                document.body.removeChild(textarea);
            }
        },

        handleFileUpload(event) {
            this.selectedFile = event.target.files[0];
        },

        processFile() {
            if (!this.selectedFile) {
                this.dispatchMessage("error", "Please select a file!", 5000);
                return;
            }

            this.isLoading = true;
            const reader = new FileReader();

            reader.onload = (event) => {
                const fileContent = event.target.result.split('\n');

                // Save each line to tags array
                // Skip empty lines and lines starting with # or // or duplicate names, case-insensitive
                fileContent.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith('#') && !trimmedLine.startsWith('//')) {
                        const tagName = trimmedLine.toLowerCase();
                        if (!this.tags.some(tag => tag.tagName.toLowerCase() === tagName)) {
                            this.tags.push({tagName: tagName, fetched: false, following: false});
                        }
                    }
                });

                // Update local storage
                this.updateLocalStorageForTags();
            };

            reader.readAsText(this.selectedFile);

            this.filteredTags = this.tags;

            this.isLoading = false;
        },

        getTagPostsUrl(tag) {
            if (tag.fetched !== true) return null;
            return tag.postsUrl || `https://www.sankakucomplex.com/?tags=${tag.tagName}`;
        },

        getTagWikiUrl(tag) {
            if (tag.fetched !== true) return null;
            return tag.wikiUrl || `https://www.sankakucomplex.com/tag?tagName=${tag.tagName}`;
        },

        fetchTagWiki(tag, batchAction = false) {
            if (batchAction && tag.fetched === true) {
                return;
            }

            if (!batchAction) {
                this.isLoading = true;
            }

            fetch(this.TAG_WIKI_URL + tag.tagName, {
                method: 'GET'
            })
                .then((response) => response.json())
                .then(data => {
                    if (!batchAction && !data.tag && !data.wiki) {
                        console.error('Unexpected response data:', data);
                        this.dispatchMessage("error", "Unexpected response data, check log for more details", 5000);
                        return;
                    }

                    if (data.tag) {
                        tag.fetched = true; // Set fetched to true
                        Object.assign(tag, data.tag); // Merge tag data with fetched data
                    }

                    if (data.wiki) {
                        tag.wiki = data.wiki; // Add wiki data to tag
                    }

                    if (!batchAction) {
                        this.dispatchMessage("success", "Tags fetching status updated!", 5000);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);

                    // Update tag fetching status and tag id of both alpinejs and local storage
                    tag.fetched = null;

                    if (!batchAction) {
                        this.dispatchMessage("error", error.message, 5000);
                    }
                })
                .finally(() => {
                    if (!batchAction) {
                        this.updateLocalStorageForTags();
                        this.checkTokenExpiry();
                        this.isLoading = false;
                    }
                });
        },

        removeTag(tag) {
            // if (tag.following === true) {
            //     this.unfollowTag(tag);
            // }
            this.isLoading = true;
            this.tags = this.tags.filter(t => t.tagName !== tag.tagName);
            this.filteredTags = this.filteredTags.filter(t => t.tagName !== tag.tagName);
            this.recentlyUnfollowedTags.push(tag);

            // Update local storage
            this.updateLocalStorageForTags();

            this.dispatchMessage("success", "Tag removed!", 5000);
            this.isLoading = false;
        },

        selectTag(tag) {
            tag.selected = !tag.selected

            if (tag.selected === true) {
                this.selectedTags.push(tag);
            } else {
                this.selectedTags = this.selectedTags.filter(selectedTag => selectedTag.id !== tag.id);
            }
        },

        selectAll() {
            this.selectedAll = !this.selectedAll;

            this.filteredTags.forEach(tag => {
                if (tag.fetched) {
                    tag.selected = this.selectedAll;
                }
            });

            this.selectedTags = this.selectedAll ? this.filteredTags.filter(tag => tag.selected) : [];

            console.log(this.selectedTags);
        },

        async refreshAllTags() {
            if (!confirm('Do you want to refresh all tags?')) {
                return;
            }

            console.log('Refreshing all tags');
            this.isLoading = true;

            const batchSize = 10;

            try {
                for (let i = 0; i < this.tags.length; i += batchSize) {
                    const batch = this.tags.slice(i, i + batchSize);
                    const fetchPromises = batch.map(tag => this.fetchTagWiki(tag, true));
                    await Promise.all(fetchPromises);

                    if (i + batchSize < this.tags.length) {
                        await this.sleep(5000);
                    }
                }

                this.dispatchMessage("success", "All tags refreshed successfully!", 5000);
            } catch (error) {
                console.error('Error in refreshing all tags:', error);
                this.dispatchMessage("error", "Error refreshing tags. Please try again.", 5000);
            } finally {
                this.updateLocalStorageForTags();
                this.isLoading = false;
            }
        },

        async fetchFollowingTags() {
            this.isLoading = true;

            try {
                const response = await fetch(this.FOLLOWING_URL, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.token.access_token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    console.error('Network response was not ok');
                    this.dispatchMessage("error", "Network response was not ok!", 5000);
                }

                const data = await response.json();

                if (data.tags) {
                    data.tags.forEach(followingTag => {
                        const foundTag = this.tags.find(tag => tag.id === followingTag.id);
                        if (foundTag) {
                            foundTag.following = true;
                        } else {
                            const newTag = {
                                id: followingTag.id,
                                tagName: followingTag.tagName,
                                fetched: false,
                                following: true
                            };
                            this.tags.unshift(newTag);
                        }
                    });

                    this.dispatchMessage("success", "Tags following status updated!", 5000);
                } else {
                    console.error('Unexpected response data:', data);
                    this.dispatchMessage("error", "Unexpected response data, check log for more details", 5000);
                }
            } catch (error) {
                console.error('Error in fetching following status:', error);
                this.dispatchMessage("error", `Error fetching following status: ${error.message}`, 5000);
            } finally {
                await this.refreshAllTags();
                this.lastFetchFollowingTagsTime = new Date();
                this.updateLocalStorageForTags();
                this.isLoading = false;
            }
        },

        async handleFollowTag(tag, isToFollow) {
            const options = {
                method: isToFollow ? 'POST' : 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'following_id': tag.id,
                    'type': "tag"
                })
            };

            try {
                const response = await fetch(this.FOLLOWING_URL, options);

                if (!response.ok) {
                    return Promise.reject((await response).statusText);
                }

                const data = await response.json();

                if (data.id || data.success) {
                    tag.following = isToFollow;
                    return Promise.resolve(true);
                } else {
                    console.error('Unexpected response for tag:', tag.tagName);
                    return Promise.reject((await response).statusText);
                }
            } catch (error) {
                console.error('Error when following tag:', tag.tagName);
                return Promise.reject(error);
            }
        },

        async handleFollowSelectedTags(isToFollow = true, singleTag = null) {
            let tagsToProcess = [...this.selectedTags];
            if (singleTag !== null) {
                tagsToProcess = [];
                tagsToProcess.push(singleTag);
            }

            if (tagsToProcess.length === 0) {
                this.dispatchMessage("error", "No tags selected!", 5000);
                return;
            }

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                this.dispatchMessage("error", "Last fetch was more than 5 minutes ago. Fetch following status first!", 5000);
                return;
            }

            if (isToFollow) {
                tagsToProcess = tagsToProcess.filter(tag => !tag.following);
            } else {
                tagsToProcess = tagsToProcess.filter(tag => tag.following);
            }

            if (tagsToProcess.length === 0) {
                this.dispatchMessage("error", isToFollow ? "All selected tags are already followed!" : "All selected tags are not followed!", 5000);
                return;
            }

            // Ask if user wants to follow all tags
            if (tagsToProcess.length > 1 && !confirm('Proceed with selected tags?')) {
                return;
            }

            console.log('tagsToProcess', tagsToProcess);

            this.isLoading = true;
            console.log('Processing selected tag(s)');

            const batchSize = 3;
            let successCount = 0;
            let failCount = 0;

            try {
                for (let i = 0; i < tagsToProcess.length; i += batchSize) {
                    const batch = tagsToProcess.slice(i, i + batchSize);
                    const results = await Promise.allSettled(batch.map(tag => this.handleFollowTag(tag, isToFollow)));

                    results.forEach(result => {
                        if (result.status === 'fulfilled') {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    });

                    if (i + batchSize < tagsToProcess.length) {
                        await this.sleep(5000); // Wait 5 seconds before processing the next batch
                    }
                }

                this.dispatchMessage("success", `Processed ${successCount} tags. Failed to process ${failCount} tags.`, 5000);
                return {successCount, failCount};
            } catch (error) {
                console.error('Error while following tags:', error);
                this.dispatchMessage("error", "Unknown error. Check log for more details", 5000);
            } finally {
                this.updateLocalStorageForTags();
                this.isLoading = false;
            }
        },

        getLastFetchTime() {
            const lastFetchTime = this.lastFetchFollowingTagsTime || localStorage.getItem('lastFetchFollowingTagsTime');
            return lastFetchTime ? Math.abs(new Date() - new Date(lastFetchTime)) / 1000 : 999999999;
        },

        sortTags(attribute) {
            // Toggle sorting direction if the same header is clicked again
            if (this.sortBy === attribute) {
                this.sortDesc = !this.sortDesc;
            } else {
                this.sortBy = attribute;
                this.sortDesc = false; // Default to ascending when changing sort attribute
            }

            // Sort based on the attribute
            this.tags.sort((a, b) => {
                let valA = a[attribute];
                let valB = b[attribute];

                // Handle case-insensitive sorting for strings (e.g., 'tagName')
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return this.sortDesc ? 1 : -1;
                if (valA > valB) return this.sortDesc ? -1 : 1;
                return 0;
            });

            // Update local storage
            this.updateLocalStorageForTags();
        },

        filterTags() {
            this.filteredTags = this.tags.filter((e) => {
                let t = "all" === this.selectedFollowFilter || e.following == this.selectedFollowFilter;

                if (this.selectedFetchFilter === "all") {
                    return t;
                }

                if (this.selectedFetchFilter === "0") {
                    return t && (e.fetched === false || e.fetched === null);
                }

                if (this.selectedFetchFilter === "1") {
                    return t && e.fetched === true;
                }
            });
        },

        downloadTagsJson() {
            // Prepare the data
            const data = this.tags.map(tag => ({
                ...tag,
                postsUrl: this.getTagPostsUrl(tag),
                wikiUrl: this.getTagWikiUrl(tag),
            }));

            // Convert the modified tags array to JSON
            const tagsJson = JSON.stringify(data, null, 2); // Formatting for readability
            const blob = new Blob([tagsJson], {type: 'application/json'});

            // Create a URL for the blob
            const url = URL.createObjectURL(blob);

            // Open a new tab and display the JSON data with URLs
            const newTab = window.open();
            if (newTab) {
                newTab.document.write(`<pre>${tagsJson}</pre>`); // Display JSON in a readable format
                newTab.document.close();
            } else {
                this.dispatchMessage("error", "Failed to open a new tab. Please check your browser settings.", 5000);
            }

            // Optionally revoke the blob URL to free memory (after it's used)
            URL.revokeObjectURL(url);
        },

        directDownloadTagsJson() {
            // Prepare the data
            const data = this.tags.map(tag => ({
                ...tag,
                postsUrl: this.getTagPostsUrl(tag),
                wikiUrl: this.getTagWikiUrl(tag),
            }));

            // Convert the data to JSON format
            const jsonContent = JSON.stringify(data, null, 2);

            // Create a Blob from the JSON data
            const blob = new Blob([jsonContent], {type: "application/json"});

            // Create a download link and trigger it
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tags.json';
            link.click();

            // Cleanup the URL object
            URL.revokeObjectURL(url);
        },

        getTagSearchSuggestions(inputElement) {
            const term = inputElement.value.trim();
            if (this.tag) {
                console.log(this.tag);
                this.currentSearchTag = this.tag;
            }

            // If the input element changes, reset the fetched status to refetch
            if (this.currentSearchInputElement !== inputElement) {
                this.searchTagSuggestionsFetched = false;
                this.currentSearchInputElement = inputElement;
            }

            // If no input, clear suggestions and return
            if (term.length === 0) {
                this.searchTagSuggestions = [];
                this.searchTagSuggestionsFetched = false;
                return;
            }

            // If suggestions are already fetched, display them directly
            if (this.searchTagSuggestionsFetched) {
                this.showSuggestions(inputElement);
                return;
            }

            console.log('Fetching suggestions for: ', term);

            fetch(this.TAG_SEARCH_AUTO_SUGGEST_CREATING_URL + inputElement.value, {method: 'GET'})
                .then(response => response.json())
                .then(data => {
                    if (data.length > 0) {
                        this.searchTagSuggestions = data;
                        this.searchTagSuggestionsFetched = true; // Mark suggestions as fetched
                        this.showSuggestions(inputElement);
                    } else {
                        this.searchTagSuggestions = [];
                        this.searchTagSuggestionsFetched = false;
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    this.dispatchMessage("error", error.message, 5000);
                    this.searchTagSuggestions = [];
                    this.searchTagSuggestionsFetched = false;
                });
        },

        // Position the suggestion container below the active input
        showSuggestions(inputElement) {
            // Find the closest parent div of the input element
            const closestDiv = inputElement.closest('div');

            // If the closest div exists, append the suggestions container to it
            if (closestDiv) {
                const suggestionsContainer = this.$refs.suggestionsContainer;

                // Remove the suggestions container from the previous parent (if any)
                if (suggestionsContainer.parentNode) {
                    suggestionsContainer.parentNode.removeChild(suggestionsContainer);
                }

                // Append the suggestions container to the closest div
                closestDiv.appendChild(suggestionsContainer);

                // Position it correctly relative to the input element
                suggestionsContainer.classList.remove('hidden');
                suggestionsContainer.style.position = 'absolute';
                suggestionsContainer.style.top = `${inputElement.offsetTop + inputElement.offsetHeight}px`;
                suggestionsContainer.style.left = `${inputElement.offsetLeft}px`;
            }
        },

        hideSuggestions() {
            const suggestionsContainer = this.$refs.suggestionsContainer;
            suggestionsContainer.classList.add('hidden');
        },

        showTagsUrl(tag, $el) {
            // Find the closest parent div of the input element
            const closestDiv = $el.closest('div');

            if (closestDiv) {
                this.currentTag = tag;
                const tagUrlsContainer = this.$refs.tagUrlsContainer;

                // Append the container to the closest div
                closestDiv.appendChild(tagUrlsContainer);

                // Position it correctly relative to the input element
                tagUrlsContainer.classList.remove('hidden');
                tagUrlsContainer.classList.add('grid');
                tagUrlsContainer.style.position = 'absolute';
                tagUrlsContainer.style.bottom = `${$el.offsetTop + $el.offsetHeight + 5}px`;
                tagUrlsContainer.style.left = `${$el.offsetLeft}px`;
                tagUrlsContainer.style.width = `max-content`;

                this.isShowingTagURL = true;

                // Get the url elements
                // const wikiUrlEl = this.$refs.tagWikiUrlEl;
                // const postsUrlEl = this.$refs.tagPostsUrlEl;

                // wikiUrlEl.href = this.getTagWikiUrl(tag);
                // postsUrlEl.href = this.getTagPostsUrl(tag);
            }
        },

        hideTagsUrl() {
            if (!this.isShowingTagURL) return;

            const tagUrlsContainer = this.$refs.tagUrlsContainer;
            tagUrlsContainer.classList.remove('grid');
            tagUrlsContainer.classList.add('hidden');
            this.isShowingTagURL = false;
        },

        applySuggestion(suggestion) {
            let tag = this.currentSearchTag;
            if (tag) {
                tag.tagName = suggestion.tagName;
                tag.fetched = false;
                this.fetchTagWiki(tag);
            } else {
                // Global search
                if (this.tags.some(tag => tag.tagName === suggestion.tagName)) {
                    this.dispatchMessage("error", "Tag already exists!", 5000);
                    return;
                }

                this.currentSearchInputElement.value = suggestion.tagName;
                const newTag = {tagName: suggestion.tagName, fetched: false, following: false};
                this.tags.unshift(newTag);
                this.fetchTagWiki(newTag);
            }
        },

        // Function to format large numbers
        formatPostCount(value) {
            if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M'; // Format millions
            } else if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K'; // Format thousands
            }
            return value; // Return the original number if less than 1000
        },

        // Helper function to add a delay
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // Helper function to extract required properties from each post
        extractPostData(post) {
            return {
                file_size: post.file_size,
                file_type: post.file_type,
                file_url: post.file_url,
                is_favorited: post.is_favorited,
                height: post.height,
                id: post.id,
                preview_url: post.preview_url,
                rating: post.rating,
                sample_url: post.sample_url,
                source: post.source,
                status: post.status,
                video_duration: post.video_duration,
                width: post.width,
                base64EncodedReviewImage: null
            };
        },

        formatFileSize(size) {
            if (size >= 1024 * 1024) {
                return (size / (1024 * 1024)).toFixed(1) + ' MB';
            } else if (size >= 1024) {
                return (size / 1024).toFixed(1) + ' KB';
            }
            return size + ' bytes';
        },

        get postsToShow() {
            const postsData = this.fetchedPostsData.find(data => data.tagName === this.selectedTagToShowPosts.tagName);
            if (postsData) {
                return postsData.fetchedPosts;
            } else {
                return [];
            }
        },

        // Computed property for paginated posts
        get paginatedPosts() {
            const start = (this.currentPage - 1) * this.postsPerPage;
            const end = start + this.postsPerPage;
            // console.log(start, end);
            return this.postsToShow.slice(start, end);
        },

        // Calculate total pages based on postsPerPage
        updateTotalPages() {
            this.totalPages = Math.ceil(this.postsToShow.length / this.postsPerPage);
            this.currentPage = 1; // Reset to first page when posts per page changes
        },

        // Go to next page
        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
            }
        },

        // Go to previous page
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
            }
        },

        // Method to jump to the selected page
        jumpToPage($el) {
            // Make sure the value is not empty
            if (!$el.value) {
                return;
            }

            // Make sure the entered value is within the valid range
            if ($el.value < 1) {
                this.currentPage = 1;
                $el.value = 1;
            } else if ($el.value > this.totalPages) {
                this.currentPage = this.totalPages;
                $el.value = this.totalPages;
            } else {
                this.currentPage = $el.value;
            }
        },

        // Method to validate input when input field loses focus
        validatePage($el) {
            if ($el.value < 1) {
                $el.value = 1;
            } else if ($el.value > this.totalPages) {
                $el.value = this.totalPages;
            }
        },

        async completePostBase64Src(file_type, preview_url) {
            if (this.supportedImageTypes.includes(file_type)) {
                return 'data:' + file_type + ';base64,' + await this.fetchImageBase64Encoded(preview_url);
            } else {
                return null;
            }
        },

        // Fetch posts of a specific page
        async fetchPostsOfPage(tag, limit, page) {
            const url = `${this.TAG_POSTS_URL}&tags=${tag.tagName}&limit=${limit}&page=${page}`;

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.token.access_token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    return Promise.all(data.map(async post => ({
                        ...this.extractPostData(post),
                        base64EncodedReviewImage: this.completePostBase64Src(post.file_type, post.preview_url)
                    }))); // Only extract relevant data
                } else {
                    throw new Error(`Failed to fetch page data: ${response.status} - ${response.statusText}`);
                }
            } catch (error) {
                console.error('Error fetching page data:', error);
                throw error;
            }
        },

        async fetchAllPostsOfTag(tag, limit = 20) {
            this.fetchTagWiki(tag); // Fetch tag data first
            this.isShowingPosts = false;

            const realPostCount = tag.post_count || 0;

            // If no posts are available for the tag, exit early
            if (realPostCount === 0) {
                this.dispatchMessage("error", "No posts available for this tag!", 5000);
                return;
            }

            let needToFetch = false;

            const existingPostsDataIndex = this.fetchedPostsData.findIndex(data => data.tagName === tag.tagName);
            const fetchedData = this.fetchedPostsData[existingPostsDataIndex] || {
                fetchedPosts: [],
                lastPostFetchedTime: 0,
                fetchedPostCount: 0,
                tagName: tag.tagName
            };

            const fetchedPostCount = fetchedData.fetchedPostCount || 0;
            const lastPostFetchedTime = fetchedData.lastPostFetchedTime || 0;

            needToFetch = existingPostsDataIndex === -1 || fetchedPostCount !== realPostCount || (new Date().getTime() - lastPostFetchedTime) > 3600000;

            // If all posts are already fetched and no need to fetch again, exit early
            if (!needToFetch) {
                this.selectedTagToShowPosts = tag;
                this.updateTotalPages();
                this.isShowingPosts = true;
                return;
            }

            const totalPages = Math.ceil(realPostCount / limit);
            const fetchedPages = Math.floor(fetchedPostCount / limit);
            const remainingPages = totalPages - fetchedPages;
            let fetchedPosts = [...fetchedData.fetchedPosts];

            // Remove the extra posts if the fetched count is more than the total count to avoid duplicates when merge
            fetchedPosts = fetchedPosts.slice(0, fetchedPages * limit - 1);

            try {
                this.isFetchingPosts = true; // Show loading state

                console.log(`Fetching all posts for ${tag.tagName}`);
                console.log(`Need to fetch ${remainingPages} pages`);

                // Loop through all pages with a 3-second delay between each fetch
                for (let i = 1; i <= remainingPages; i++) {
                    const data = await this.fetchPostsOfPage(tag, limit, i);
                    fetchedPosts.push(...data);

                    // Log and show success message for each fetched page
                    console.log(`Fetched page ${i} of ${remainingPages}`);
                    this.dispatchMessage("success", `Fetched page ${i} of ${remainingPages}`, 2000);

                    // Wait for 3 seconds before fetching the next page
                    await this.sleep(3000);
                }

                // Filter only "safe" posts
                // tag.fetchedPosts = fetchedPosts.filter(post => post.rating === 's');

                const lastPostFetchedTime = new Date().getTime();
                const postsDataToUpdate = {fetchedPosts, fetchedPostCount: fetchedPosts.length, lastPostFetchedTime};

                if (existingPostsDataIndex !== -1) {
                    // Update the existing post
                    this.fetchedPostsData[existingPostsDataIndex] = {...this.fetchedPostsData[existingPostsDataIndex], ...postsDataToUpdate};
                } else {
                    // Add a new post
                    this.fetchedPostsData.push({tagName: tag.tagName, ...postsDataToUpdate});
                }

                // Store the number of fetched posts and update fetched time
                this.tags = this.tags.map(t => t.tagName === tag.tagName ? {
                    ...t,
                    fetchedPostCount: fetchedPosts.length,
                    lastPostFetchedTime
                } : t);

                // Once posts are fetched
                this.selectedTagToShowPosts = tag;
                this.updateTotalPages();
                this.updateLocalStorageForTags();

                this.dispatchMessage("success", `${fetchedPosts.length} posts fetched for ${tag.tagName}`, 5000);
                this.isShowingPosts = true; // Show the posts
            } catch (error) {
                console.error('Error fetching posts:', error);
                this.dispatchMessage("error", error.message, 5000);
            } finally {
                // Set loading state to false after all requests or an error
                this.isFetchingPosts = false;
                this.isLoading = false;
            }
        },

        async fetchImageBase64Encoded(url) {
            try {
                const base64EncodedURL = btoa(url);
                const response = await fetch(this.PROXY_HOST + base64EncodedURL,
                    {
                        method: 'GET',
                        mode: 'cors'
                    }
                );

                const blob = await response.blob(); // Get image as blob
                const reader = new FileReader(); // Create FileReader to read the blob

                return new Promise((resolve, reject) => {
                    reader.onload = () => {
                        resolve(reader.result.split(',')[1]);
                    };
                    reader.onerror = () => {
                        reject(new Error('Error reading the image file.'));
                    };

                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error('Error fetching image:', error);
                return null;
            }
        },

        handleLikePost(post) {
            const {method, successMessage, errorMessage} = post.is_favorited
                ? {method: 'DELETE', successMessage: 'Post unfollowed!', errorMessage: 'Error unfollowing post!'}
                : {method: 'POST', successMessage: 'Post followed!', errorMessage: 'Error following post!'};

            this.isLoading = true;
            fetch(this.POST_FOLLOW_URL + post.id + '/favorite?lang=en', {
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                }
            })
                .then((response) => response.json())
                .then(data => {
                    if (data.success) {
                        post.is_favorited = !post.is_favorited;
                        this.dispatchMessage("success", successMessage, 5000);
                    } else {
                        this.dispatchMessage("error", errorMessage, 5000);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    this.dispatchMessage("error", error.message, 5000);
                })
                .finally(() => {
                    this.isLoading = false;
                    this.updateLocalStorageForTags();
                });
        }
    };
}