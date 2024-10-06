// Define the window.dispatchMessages function
window.dispatchMessages = function (messages, timeout) {
    messages.forEach(message => {
        const notification = document.createElement('div');
        notification.className = `notification ${message.type}`;
        notification.innerText = `${message.type.toUpperCase()}: ${message.text}`;
        document.body.appendChild(notification);

        if (timeout > 0) {
            setTimeout(() => {
                notification.remove();
            }, timeout);
        }
    });
};

// Define the dispatchMessage function
function dispatchMessage(type, message, timeout) {
    window.dispatchMessages([{ type: type, text: message }], timeout);
}

function initSankakuTools() {
    return {
        API_URL: "https://capi-v2.sankakucomplex.com",
        LOGIN_URL: "https://capi-v2.sankakucomplex.com/auth/token",
        TAG_WIKI_URL: "https://capi-v2.sankakucomplex.com/tag-and-wiki/name/",
        FOLLOWING_URL: "https://sankakuapi.com/users/followings?lang=en",
        TAG_SEARCH_AUTO_SUGGEST_CREATING_URL: "https://sankakuapi.com/tags/autosuggestCreating?lang=en&tag=",
        TAG_POSTS_URL: "https://capi-v2.sankakucomplex.com/posts?lang=en",
        isLoading: false,
        loginData: {
            login: '',
            password: ''
        },
        initialized: false,
        token: {
            type: '',
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
        currentSearchInputElement: null,
        currentSearchTag: null,
        searchTagSuggestions: [],
        searchTagSuggestionsFetched: false,
        postsPerPage: 20, // Number of posts per page (default 20)
        currentPage: 1, // Track the current page
        totalPages: 1, // Track the total number of pages
        selectedTagToShowPosts: { fetchedPosts: [] }, // Selected tag with posts
        isFetchingPosts: false, // Track if posts are being fetched
        isShowingPosts: false, // Track if posts are being shown

        dispatchMessage(type, message, timeout) {
            window.dispatchMessages([{ type: type, text: message }], timeout);
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
                this.dispatchMessage("warning", "Last fetch was more than 5 minutes ago. You should fetch following tags again.", 5000);
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

            this.filteredTags = this.tags
        },

        updateLocalStorageForTags() {
            // update all local storage values related to tags
            localStorage.setItem('localTags', JSON.stringify(this.tags));
            localStorage.setItem('lastFetchFollowingTagsTime', this.lastFetchFollowingTagsTime);
            localStorage.setItem('recentlyUnfollowedTags', JSON.stringify(this.recentlyUnfollowedTags));
        },

        getToken() {
            this.isLoading = true;
            fetch(this.LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.loginData)
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else if (response.ok) {
                        return response.json();
                    } else {
                        this.dispatchMessage("warning", "Invalid credentials or unknown error!", 5000);
                        this.isLoading = false;
                    }
                })
                .then(data => {
                    this.isLoading = false;
                    if (data.success && data.token_type && data.access_token && data.refresh_token) {
                        // Store token information
                        this.token.type = data.token_type;
                        this.token.access_token = data.access_token;
                        this.token.refresh_token = data.refresh_token;
                        this.token.access_token_ttl = data.access_token_ttl;
                        this.token.refresh_token_ttl = data.refresh_token_ttl;
                        this.token.hasToken = true;

                        // Calculate expiry dates
                        const now = new Date();
                        this.token.expiry_date = new Date(now.getTime() + this.token.access_token_ttl * 1000);
                        this.token.refresh_expiry_date = new Date(now.getTime() + this.token.refresh_token_ttl * 1000);

                        // Store token details in localStorage
                        localStorage.setItem('skkToken', JSON.stringify(this.token));

                        this.dispatchMessage("success", "Login successful! Tokens saved.", 3000);
                        this.checkTokenExpiry();
                    } else {
                        this.dispatchMessage("warning", "Invalid credentials or unknown error!", 5000);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    this.isLoading = false;
                });
        },

        checkTokenExpiry() {
            const now = new Date();

            if (this.token.expiry_date) {
                const accessTokenExpiresIn = Math.round((this.token.expiry_date - now) / 1000);
                if (accessTokenExpiresIn <= 0) {
                    this.dispatchMessage("warning", "Access token has expired. Please log in again.", 5000);
                    this.token.hasToken = false;
                } else if (accessTokenExpiresIn <= 3600) {
                    this.dispatchMessage("warning", `Access token will expire in ${Math.round(accessTokenExpiresIn / 60)} minutes.`, 5000);
                }
            }

            if (this.token.refresh_expiry_date) {
                const refreshTokenExpiresIn = Math.round((this.token.refresh_expiry_date - now) / 1000);
                if (refreshTokenExpiresIn <= 0) {
                    this.dispatchMessage("warning", "Refresh token has expired. Please log in again.", 5000);
                    this.token.hasToken = false;
                } else if (refreshTokenExpiresIn <= 86400) {
                    this.dispatchMessage("warning", `Refresh token will expire in ${Math.round(refreshTokenExpiresIn / 3600)} hours.`, 5000);
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
                this.dispatchMessage("warning", "Please select a file!", 5000);
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
                            this.tags.push({ tagName: tagName, fetched: false, following: false });
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

        fetchTagWiki(tag, fetchAll = false) {
            // if (!fetchAll && tag.fetched === true) {
            //     this.dispatchMessage("warning", "Tag already fetched!", 5000);
            //     return;
            // }

            if (fetchAll && tag.fetched === true) {
                return;
            }

            if (!fetchAll) {
                this.isLoading = true;
            }

            fetch(this.TAG_WIKI_URL + tag.tagName, {
                method: 'GET'
            })
                .then(response => {
                    if (response.ok) {
                        return response.json()
                    } else if (!fetchAll) {
                        throw new Error('Tag not found or something went wrong!');
                    }
                })
                .then(data => {
                    if (!fetchAll && !data.tag && !data.wiki) {
                        this.dispatchMessage("warning", "Unknown error!", 5000);
                        return;
                    }

                    if (data.tag) {
                        tag.fetched = true; // Set fetched to true
                        Object.assign(tag, data.tag); // Merge tag data with fetched data
                    }

                    if (data.wiki) {
                        tag.wiki = data.wiki; // Add wiki data to tag
                    }

                    if (!fetchAll) {
                        // Update local storage
                        this.updateLocalStorageForTags();

                        // Check token expiry
                        this.checkTokenExpiry();
                        this.dispatchMessage("success", "Tags fetching status updated!", 5000);
                        this.isLoading = false;
                    }
                })
                .catch(error => {
                    console.error('Error:', error);

                    // Update tag fetching status and tag id of both alpinejs and local storage
                    tag.fetched = null;

                    if (!fetchAll) {
                        // Update local storage
                        this.updateLocalStorageForTags();

                        this.dispatchMessage("warning", error.message, 5000);
                        this.isLoading = false;
                    }
                });
        },

        async refreshAllTags() {
            // Ask if user wants to refresh all tags
            if (!confirm('Do you want to refresh all tags?')) {
                return;
            }

            this.isLoading = true; // Set loading state
            console.log('Refreshing all tags');

            const batchSize = 10; // Process 10 tags at a time
            let batchIndex = 0;

            const processBatch = async () => {
                // Get the current batch of tags
                const batch = this.tags.slice(batchIndex, batchIndex + batchSize);
                const fetchPromises = batch.map(tag => this.fetchTagWiki(tag, true));

                // Wait for all fetches in the current batch to complete
                await Promise.all(fetchPromises);
                batchIndex += batchSize; // Move to the next batch

                // If there are more tags, continue processing after a 2-second delay
                if (batchIndex < this.tags.length) {
                    setTimeout(processBatch, 5000); // Wait 2 seconds and process next batch
                } else {
                    this.isLoading = false; // Reset loading state
                    return true;
                }
            };

            // Start processing the first batch
            await processBatch();
            this.updateLocalStorageForTags();
        },

        getTagPostsUrl(tag) {
            if (tag.fetched !== true) return null;
            return tag.postsUrl || `https://www.sankakucomplex.com/?tags=${tag.tagName}`;
        },

        getTagWikiUrl(tag) {
            if (tag.fetched !== true) return null;
            return tag.wikiUrl || `https://www.sankakucomplex.com/tag?tagName=${tag.tagName}`;
        },

        fetchFollowingTags() {
            this.refreshAllTags().then(() => {
                this.isLoading = true;
                fetch(this.FOLLOWING_URL, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.token.access_token}`,
                        'Content-Type': 'application/json'
                    }
                })
                    .then(response => {
                        if (response.ok) {
                            return response.json()
                        } else {
                            throw new Error('Token expired or something went wrong!');
                        }
                    })
                    .then(data => {
                        if (data.tags) {
                            // for each tag in the response, check if it exists in this.tags and update following status, else add it fetch data
                            data.tags.forEach(followingTag => {
                                const foundTag = this.tags.find(tag => tag.id === followingTag.id);
                                if (foundTag) {
                                    foundTag.following = true; // Update following status
                                } else {
                                    const tag = { id: followingTag.id, tagName: followingTag.tagName, fetched: false, following: true };
                                    this.tags.unshift(tag); // Add the tag to tags
                                    this.fetchTagWiki(tag); // Fetch data
                                }
                            });

                            // Update local storage
                            this.lastFetchFollowingTagsTime = new Date();
                            this.updateLocalStorageForTags();

                            this.dispatchMessage("success", "Tags following status updated!", 5000);

                            // Check token expiry
                            this.checkTokenExpiry();
                        } else {
                            this.dispatchMessage("warning", "No data or unknown error!", 5000);
                        }

                        this.isLoading = false;
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        this.dispatchMessage("warning", error.message, 5000);

                        this.isLoading = false;
                    });
            }).catch(error => {
                console.error('Error in refreshing tags:', error);
                this.dispatchMessage("warning", "Some tags could not be refreshed.", 5000);
                this.isLoading = false; // Reset loading state
            });
        },

        followTag(tag, batchAction = false) {
            if (!batchAction && tag.following === true) {
                this.dispatchMessage("warning", "Tag already followed, please refresh the status!", 5000);
                return;
            }

            if (batchAction && tag.following === true) {
                return;
            }

            this.isLoading = true;
            fetch(this.FOLLOWING_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'following_id': `${tag.id}`,
                    'type': "tag"
                })
            })
                .then(response => {
                    if (response.ok) {
                        return response.json()
                    } else if (!batchAction) {
                        throw new Error('Token expired or something went wrong!');
                    }
                })
                .then(data => {
                    if (data.id) {
                        tag.following = true; // Set following to true

                        if (!batchAction) {
                            // Update local storage
                            this.updateLocalStorageForTags();
                            this.dispatchMessage("success", "Tag followed!", 5000);
                            // Check token expiry
                            this.checkTokenExpiry();
                        }
                    } else {
                        if (!batchAction) {
                            this.dispatchMessage("warning", "No data or unknown error!", 5000);
                        } else {
                            throw new Error('Error following tag: ' + tag.tagName);
                        }
                    }

                    this.isLoading = false;
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (!batchAction) {
                        this.dispatchMessage("warning", error.message, 5000);
                    }

                    this.isLoading = false;
                });
        },

        unfollowTag(tag, batchAction = false) {
            if (!batchAction && tag.following === false && !confirm('Confirm unfollow?')) {
                return;
            }

            if (batchAction && tag.following === false) {
                return;
            }

            this.isLoading = true;
            fetch(this.FOLLOWING_URL, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'following_id': `${tag.id}`,
                    'type': "tag"
                })
            })
                .then(response => {
                    if (response.ok) {
                        return response.json()
                    } else if (!batchAction) {
                        throw new Error('Token expired or something went wrong!');
                    }
                })
                .then(data => {
                    if (data.success === true) {
                        // Update following status of the tag
                        tag.following = false;

                        // Add the tag to recentlyUnfollowedTags
                        // push only if not exist
                        if (!this.recentlyUnfollowedTags.find(followedTag => followedTag.id === tag.id)) {
                            this.recentlyUnfollowedTags.push(tag);
                        }

                        if (!batchAction) {
                            // Update local storage
                            this.updateLocalStorageForTags();
                            this.dispatchMessage("success", "Tag unfollowed successfully!", 5000);

                            // Check token expiry
                            this.checkTokenExpiry();
                        }
                    } else if (!batchAction) {
                        this.dispatchMessage("warning", "No data or unknown error!", 5000);
                    }

                    this.isLoading = false;
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (!batchAction) {
                        this.dispatchMessage("warning", error.message, 5000);
                    }

                    this.isLoading = false;
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

        followSelectedTags() {
            if (this.selectedTags.length === 0) {
                this.dispatchMessage("warning", "No tags selected!", 5000);
                return;
            }

            // Ask if user wants to follow all tags
            if (!confirm('Do you want to follow selected tags?')) {
                return;
            }

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                if (!confirm('Last fetch was more than 5 minutes ago. Do you want to fetch following status first?')) {
                    return;
                }
                this.fetchFollowingTags();
                return;
            }

            this.isLoading = true;
            console.log('Following all tags');

            const batchSize = 2;
            let batchIndex = 0;

            const processBatch = () => {
                const batch = this.selectedTags.slice(batchIndex, batchIndex + batchSize);
                const followPromises = batch.map(tag => this.followTag(tag, true));

                // Wait for all follows in the current batch to complete
                Promise.all(followPromises)
                    .then(() => {
                        batchIndex += batchSize; // Move to the next batch

                        // If there are more tags, continue processing
                        if (batchIndex < this.selectedTags.length) {
                            setTimeout(processBatch, 2000); // Wait 2 seconds and process next batch
                        } else {
                            this.isLoading = false; // Reset loading state
                            this.dispatchMessage("success", "All selected tags followed!", 5000);
                        }
                    })
                    .catch(error => {
                        console.error('Error in following tags:', error);
                        this.dispatchMessage("warning", "Some tags could not be followed.", 5000);
                        this.isLoading = false; // Reset loading state
                    });
                Promise.all(followPromises)
                    .then(() => {
                        batchIndex += batchSize; // Move to the next batch

                        // If there are more tags, continue processing after a 2-second delay
                        if (batchIndex < this.selectedTags.length) {
                            setTimeout(processBatch, 2000); // Wait 2 seconds and process next batch
                        } else {
                            this.isLoading = false; // Reset loading state
                            this.dispatchMessage("success", "All selected tags followed!", 5000);
                        }
                    })
                    .catch(error => {
                        console.error('Error in following tags:', error);
                        this.dispatchMessage("warning", "Some tags could not be followed.", 5000);
                        this.isLoading = false; // Reset loading state
                    });
            };

            // Start processing the first batch
            processBatch();

            this.updateLocalStorageForTags();
        },

        unFollowSelectedTags() {
            if (this.selectedTags.length === 0) {
                this.dispatchMessage("warning", "No tags selected!", 5000);
                return;
            }

            // Ask if user wants to unfollow all tags
            if (!confirm('Do you want to unfollow selected tags?')) {
                return;
            }

            // check if last fetch was more than 5 minutes ago
            if (this.getLastFetchTime() > 300) {
                if (!confirm('Last fetch was more than 5 minutes ago. Do you want to fetch following status first?')) {
                    return;
                }
                this.fetchFollowingTags();
                return;
            }

            this.isLoading = true;
            console.log('Unfollowing all tags');

            const batchSize = 2;
            let batchIndex = 0;

            const processBatch = () => {
                const batch = this.selectedTags.slice(batchIndex, batchIndex + batchSize);
                const unfollowPromises = batch.map(tag => this.unfollowTag(tag, true));

                // Wait for all unfollows in the current batch to complete
                Promise.all(unfollowPromises)
                    .then(() => {
                        batchIndex += batchSize; // Move to the next batch

                        // If there are more tags, continue processing after a 2-second delay
                        if (batchIndex < this.selectedTags.length) {
                            setTimeout(processBatch, 2000); // Wait 2 seconds and process next batch
                        } else {
                            this.isLoading = false; // Reset loading state
                            this.dispatchMessage("success", "All tags unfollowed!", 5000);
                        }
                    })
                    .catch(error => {
                        console.error('Error in unfollowing tags:', error);
                        this.dispatchMessage("warning", "Some tags could not be unfollowed.", 5000);
                        this.isLoading = false; // Reset loading state
                    });
            };

            // Start processing the first batch
            processBatch();

            this.updateLocalStorageForTags();
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
            const blob = new Blob([tagsJson], { type: 'application/json' });

            // Open a new tab and display the JSON data with URLs
            const newTab = window.open();
            newTab.document.write(`<pre>${tagsJson}</pre>`); // Display JSON in a readable format
            newTab.document.close();

            // Optionally revoke the blob URL to free memory (after it's used)
            URL.revokeObjectURL(newTab);
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
            const blob = new Blob([jsonContent], { type: "application/json" });

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

            fetch(this.TAG_SEARCH_AUTO_SUGGEST_CREATING_URL + inputElement.value, {
                method: 'GET'
            })
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
                    this.dispatchMessage("warning", error.message, 5000);
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

                // Remove the container from the previous parent (if any)
                if (tagUrlsContainer.parentNode) {
                    tagUrlsContainer.parentNode.removeChild(tagUrlsContainer);
                }

                // Append the container to the closest div
                closestDiv.appendChild(tagUrlsContainer);

                // Position it correctly relative to the input element
                tagUrlsContainer.classList.remove('hidden');
                tagUrlsContainer.style.position = 'absolute';
                tagUrlsContainer.style.bottom = `${$el.offsetTop + $el.offsetHeight + 5}px`;
                tagUrlsContainer.style.left = `${$el.offsetLeft}px`;
                tagUrlsContainer.style.width = `max-content`;

                // Get the url elements
                const wikiUrlEl = this.$refs.tagWikiUrlEl;
                const postsUrlEl = this.$refs.tagPostsUrlEl;

                // wikiUrlEl.href = this.getTagWikiUrl(tag);
                // postsUrlEl.href = this.getTagPostsUrl(tag);
            }
        },

        hideTagsUrl() {
            const tagUrlsContainer = this.$refs.tagUrlsContainer;
            tagUrlsContainer.classList.add('hidden');
        },

        applySuggestion(suggestion) {
            tag = this.currentSearchTag;
            if (tag) {
                tag.tagName = suggestion.tagName;
                tag.fetched = false;
                this.fetchTagWiki(tag);
            } else {
                // Global search
                if (this.tags.some(tag => tag.tagName === suggestion.tagName)) {
                    this.dispatchMessage("warning", "Tag already exists!", 5000);
                    return;
                }

                this.currentSearchInputElement.value = suggestion.tagName;
                const newTag = { tagName: suggestion.tagName, fetched: false, following: false };
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

        TAG_POSTS_URL: "https://capi-v2.sankakucomplex.com/posts?lang=en",

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
                height: post.height,
                id: post.id,
                preview_url: post.preview_url,
                rating: post.rating,
                sample_url: post.sample_url,
                source: post.source,
                status: post.status,
                video_duration: post.video_duration,
                width: post.width
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

        // Computed property for paginated posts
        get paginatedPosts() {
            const start = (this.currentPage - 1) * this.postsPerPage;
            const end = start + this.postsPerPage * 1; // Make sure the end is a number
            // console.log(start, end);
            return this.selectedTagToShowPosts.fetchedPosts.slice(start, end);
        },

        // Calculate total pages based on postsPerPage
        updateTotalPages() {
            this.totalPages = Math.ceil(this.selectedTagToShowPosts.fetchedPosts.length / this.postsPerPage);
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
            } else if ($el.value > this.totalPages) {
                this.currentPage = this.totalPages;
            }
        },

        // Method to validate input when input field loses focus
        validatePage($el) {
            if ($el.value < 1) {
                this.currentPage = 1;
            } else if ($el.value > this.totalPages) {
                this.currentPage = this.totalPages;
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
                    return data.map(post => this.extractPostData(post)); // Only extract relevant data
                } else {
                    throw new Error('Failed to fetch page data');
                }
            } catch (error) {
                console.error('Error fetching page data:', error);
                return [];
            }
        },

        async fetchAllPostsOfTag(tag, limit = 20) {
            this.fetchTagWiki(tag); // Fetch tag data first
            this.isShowingPosts = false;

            const postCount = tag.post_count || 0;

            // If no posts are available for the tag, exit early
            if (postCount === 0) {
                this.dispatchMessage("warning", "No posts available for this tag!", 5000);
                return;
            }

            const lastPostFetchedTime = tag.lastPostFetchedTime || 0;
            const needToFetch = lastPostFetchedTime === 0 || (new Date().getTime() - lastPostFetchedTime) > 3600000;
            const fetchedPostCount = tag.fetchedPostCount || 0;

            // If all posts are already fetched and no need to fetch again, exit early
            // Update the selected tag to show the fetched posts and exit early
            if (fetchedPostCount === postCount && !needToFetch) {
                this.selectedTagToShowPosts = { ...tag };
                this.updateTotalPages();
                this.isShowingPosts = true;
                return;
            }

            try {
                this.isFetchingPosts = true; // Show loading state
                const totalPages = Math.ceil(postCount / limit);
                const fetchedPosts = [];

                console.log(`Fetching all posts for ${tag.tagName}`);

                // Loop through all pages with a 3-second delay between each fetch
                for (let i = 1; i <= totalPages; i++) {
                    const data = await this.fetchPostsOfPage(tag, limit, i);
                    fetchedPosts.push(...data);

                    // Log and show success message for each fetched page
                    console.log(`Fetched page ${i} of ${totalPages}`);
                    this.dispatchMessage("success", `Fetched page ${i} of ${totalPages}`, 2000);

                    // Wait for 3 seconds before fetching the next page
                    await this.sleep(3000);
                }

                // Filter only "safe" posts
                tag.fetchedPosts = fetchedPosts.filter(post => post.rating === 's');

                // Store the number of fetched posts and update fetched time
                tag.fetchedPostCount = fetchedPosts.length;
                tag.lastPostFetchedTime = new Date().getTime();

                // Once posts are fetched
                this.selectedTagToShowPosts = { ...tag };
                this.updateTotalPages();
                this.updateLocalStorageForTags();

                this.dispatchMessage("success", `${fetchedPosts.length} posts fetched for ${tag.tagName}`, 5000);
                this.isShowingPosts = true; // Show the posts
            } catch (error) {
                console.error('Error fetching posts:', error);
                this.dispatchMessage("warning", error.message, 5000);
            } finally {
                // Set loading state to false after all requests or an error
                this.isFetchingPosts = false;
            }
        },
    };
}