/*
 * This file is part of the MediaWiki extension MultimediaViewer.
 *
 * MultimediaViewer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * MultimediaViewer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with MultimediaViewer.  If not, see <http://www.gnu.org/licenses/>.
 */

( function ( mw, $ ) {
	var MultiLightbox, lightboxHooks, MMVP,

		comingFromPopstate = false,

		imgsSelector = '.gallery .image img, a.image img',

		validExtensions = {
			'jpg': true,
			'jpeg': true,
			'gif': true,
			'svg': true,
			'png': true,
			'tiff': true,
			'tif': true
		};

	/**
	 * @class mw.MultimediaViewer
	 * Analyses the page, looks for image content and sets up the hooks
	 * to manage the viewing experience of such content.
	 * @constructor
	 */
	function MultimediaViewer() {
		/**
		 * MultiLightbox object used to display the pictures in the page.
		 * @property {mlb.MultiLightbox}
		 * @private
		 */
		this.lightbox = null;

		/**
		 * Whether we've fired an animation for the metadata div.
		 * @property {boolean}
		 * @private
		 */
		this.hasAnimatedMetadata = false;

		var $thumbs = $( imgsSelector ),
			urls = [],
			viewer = this;

		/**
		 * @property {number[]}
		 * @private
		 * List of acceptable image sizes...used to bucket
		 */
		this.imageWidthBuckets = [
			320,
			640,
			800,
			1024,
			1280,
			1920,
			2560,
			2880
		];

		/**
		 * @property {mw.Api}
		 * @private
		 */
		this.api = new mw.Api();

		/**
		 * @property {mw.mmv.provider.ImageInfo}
		 * @private
		 */
		this.imageInfoProvider = new mw.mmv.provider.ImageInfo( this.api, {
			// Short-circuit, don't fallback, to save some tiny amount of time
			language: mw.config.get( 'wgUserLanguage', false ) || mw.config.get( 'wgContentLanguage', 'en' )
		} );

		/**
		 * @property {mw.mmv.provider.FileRepoInfo}
		 * @private
		 */
		this.fileRepoInfoProvider = new mw.mmv.provider.FileRepoInfo( this.api );

		/**
		 * @property {mw.mmv.provider.ThumbnailInfo}
		 * @private
		 */
		this.thumbnailInfoProvider = new mw.mmv.provider.ThumbnailInfo( this.api );

		/**
		 * @property {mw.mmv.provider.UserInfo}
		 * @private
		 */
		this.userInfoProvider = new mw.mmv.provider.UserInfo( this.api );

		/**
		 * @property {mw.mmv.provider.ImageUsage}
		 * @private
		 */
		this.imageUsageProvider = new mw.mmv.provider.ImageUsage( this.api );

		/**
		 * @property {mw.mmv.provider.GlobalUsage}
		 * @private
		 */
		this.globalUsageProvider = new mw.mmv.provider.GlobalUsage( this.api, {
			doNotUseApi: !mw.config.get( 'wgMultimediaViewer' ).globalUsageAvailable
		} );
		// replace with this one to test global usage on a local wiki without going through all the
		// hassle required for installing the extension:
		//this.globalUsageProvider = new mw.mmv.provider.GlobalUsage(
		//	new mw.Api( {ajax: { url: 'http://commons.wikimedia.org/w/api.php', dataType: 'jsonp' } } )
		//);

		/**
		 * @property {mw.mmv.performance}
		 * @private
		 */
		this.performance = new mw.mmv.performance();

		// Traverse DOM, looking for potential thumbnails
		$thumbs.each( function ( i, thumb ) {
			var thisImage, $thumbCaption, caption,
				$thumb = $( thumb ),
				$link = $thumb.closest( 'a.image' ),
				$thumbContain = $link.closest( '.thumb' ),
				$enlarge = $thumbContain.find( '.magnify a' ),
				$links = $link.add( $enlarge ),
				filePageLink = $link.prop( 'href' ),
				fileTitle = mw.Title.newFromImg( $thumb ),
				index = urls.length;

			if ( !validExtensions[fileTitle.getExtension().toLowerCase()] ) {
				// Not a valid extension, skip this one
				return;
			}

			if ( $thumbContain.length === 0 ) {
				// This isn't a thumbnail! Just use the link.
				$thumbContain = $link;
			} else if ( $thumbContain.is( '.thumb' ) ) {
				$thumbCaption = $thumbContain.find( '.thumbcaption' ).clone();
				$thumbCaption.find( '.magnify' ).remove();
				viewer.whitelistHtml( $thumbCaption );
				caption = $thumbCaption.html();
				$thumbContain = $thumbContain.find( '.image' );
			}

			$links.data( 'filePageLink', filePageLink );

			// Create a LightboxImage object for each legit image
			thisImage = viewer.createNewImage( $thumb.prop( 'src' ), filePageLink, fileTitle, index, thumb, caption );

			urls.push( thisImage );

			// Register callback that launches modal image viewer if valid click
			$links.click( function ( e ) {
				return viewer.clickLinkCallback( e, this, $thumbContain, thisImage );
			} );
		} );

		if ( urls.length === 0 ) {
			// No legit images found, no need to continue
			return;
		}

		// Only if we find legit images, create a MultiLightbox object
		this.lightbox = new mw.MultiLightbox( urls, 0, mw.LightboxInterface, this );

		// Register various event hooks. TODO: Make this a function that's only called once.

		lightboxHooks.register( 'closeInterface', function () {
			if ( this.$nextButton ) {
				this.$nextButton.add( this.$prevButton ).css( 'top', '-999px' );
			}
			
			$( document.body ).removeClass( 'mw-mlb-lightbox-open' );
			if ( comingFromPopstate === false ) {
				history.pushState( {}, '', '#' );
			} else {
				comingFromPopstate = false;
			}

			viewer.hasAnimatedMetadata = false;
			viewer.isOpen = false;
		} );

		lightboxHooks.register( 'imageResize', function () {
			var ui = this;
			viewer.resize( ui );
			return false;
		} );
	}

	MMVP = MultimediaViewer.prototype;

	// TODO FIXME HACK delete this when other UI elements have been shifted away.
	MMVP.whitelistHtml = mw.mmv.ui.Element.prototype.whitelistHtml;

	/**
	 * Create an image object for the lightbox to use.
	 * @protected
	 * @param {string} fileLink Link to the file - generally a thumb URL
	 * @param {string} filePageLink Link to the File: page
	 * @param {mw.Title} fileTitle Represents the File: page
	 * @param {number} index Which number file this is
	 * @param {HTMLImageElement} thumb The thumbnail that represents this image on the page
	 * @param {string} [caption] The caption, if any.
	 * @returns {mw.LightboxImage}
	 */
	MMVP.createNewImage = function ( fileLink, filePageLink, fileTitle, index, thumb, caption ) {
		var thisImage = new mw.LightboxImage( fileLink, filePageLink, fileTitle, index, thumb, caption );
		thisImage.filePageLink = filePageLink;
		thisImage.filePageTitle = fileTitle;
		thisImage.index = index;
		thisImage.thumbnail = thumb;

		return thisImage;
	};

	/**
	 * Finds the next highest image size given a target size.
	 * Searches the bucketed sizes configured in the class.
	 * @param {number} target
	 * @return {number}
	 */
	MMVP.findNextHighestImageSize = function ( target ) {
		var i, bucket,
			buckets = this.imageWidthBuckets,
			len = buckets.length;

		for ( i = 0; i < len; i++ ) {
			bucket = buckets[i];

			if ( bucket >= target ) {
				return bucket;
			}
		}

		// If we failed to find a high enough size...good luck
		return bucket;
	};

	/**
	 * Gets the API arguments for various calls to the API to find sized thumbnails.
	 * @param {mw.LightboxInterface} ui
	 * @returns {Object}
	 * @returns {number} return.real The width that should be requested from the API
	 * @returns {number} return.css The ideal width we would like to have - should be the width of the image element later.
	 */
	MMVP.getImageSizeApiArgs = function ( ui ) {
		var thumb = ui.currentImage.thumbnail;

		return this.getThumbnailWidth( ui.$imageWrapper.width(), ui.$imageWrapper.height(),
			thumb.width, thumb.height );
	};

	/**
	 * Finds the largest width for an image so that it will still fit into a given bounding box,
	 * based on the size of a sample (some smaller version of the same image, like the thumbnail
	 * shown in the article) which is used to calculate the ratio.
	 *
	 * Returns two values, a CSS width which is the size in pixels that should be used so the image
	 * fits exactly into the bounding box, and a real width which should be the size of the
	 * downloaded image in pixels. The two will be different for two reasons:
	 * - images are bucketed for more efficient caching, so the real width will always be one of
	 *   the numbers in this.imageWidthBuckets
	 * - for devices with high pixel density (multiple actual pixels per CSS pixel) we want to use a
	 *   larger image so that there will be roughly one image pixel per physical display pixel
	 *
	 * @param {number} boundingWidth width of the bounding box
	 * @param {number} boundingHeight height of the bounding box
	 * @param {number} sampleWidth width of the sample image
	 * @param {number} sampleHeight height of the sample image
	 * @return {{css: number, real: number}} 'css' field will contain the width of the
	 *     thumbnail in CSS pixels, 'real' the actual image size that should be requested.
	 */
	MMVP.getThumbnailWidth = function( boundingWidth, boundingHeight, sampleWidth, sampleHeight ) {
		var cssWidth, bucketedWidth;
		if ( ( boundingWidth / boundingHeight ) > ( sampleWidth / sampleHeight ) ) {
			// we are limited by height; we need to calculate the max width that fits
			cssWidth = ( sampleWidth / sampleHeight ) * boundingHeight;
		} else {
			// simple case, ratio tells us we're limited by width
			cssWidth = boundingWidth;
		}
		bucketedWidth = this.findNextHighestImageSize( cssWidth );

		return {
			css: cssWidth,
			real: bucketedWidth * $.devicePixelRatio()
		};
	};

	/**
	 * Handles clicks on legit image links.
	 *
	 * @protected
	 *
	 * @param {jQuery.Event} e click event
	 * @param {HTMLElement|jQuery} clickedEle clicked element
	 * @param {jQuery} $thumbContain thumbnail container element
	 * @param {mw.LightboxImage} thisImage lightboximage object
	 */
	MMVP.clickLinkCallback = function ( e, clickedEle, $thumbContain, thisImage ) {
		// Do not interfere with non-left clicks or if modifier keys are pressed.
		if ( e.which !== 1 || e.altKey || e.ctrlKey || e.shiftKey || e.metaKey ) {
			return;
		}

		var $clickedEle = $( clickedEle ),
				initial = $thumbContain.find( 'img' ).prop( 'src' );

		if ( $clickedEle.is( 'a.image' ) ) {
			mw.mmv.logger.log( 'thumbnail-link-click' );
		} else if ( $clickedEle.is( '.magnify a' ) ) {
			mw.mmv.logger.log( 'enlarge-link-click' );
		}

		e.preventDefault();

		this.loadImage( thisImage, initial );

		return false;
	};

	/**
	 * Handles resize events in viewer.
	 *
	 * @protected
	 *
	 * @param {mw.LightboxInterface} ui lightbox that got resized
	 */
	MMVP.resize = function ( ui ) {
		var viewer = this,
			fileTitle = this.currentImageFileTitle,
			imageWidths;

		if ( fileTitle ) {
			imageWidths = this.getImageSizeApiArgs( ui );
			this.fetchImageInfoWithThumbnail( fileTitle, imageWidths.real ).then( function( imageInfo ) {
					viewer.loadResizedImage( ui, imageInfo, imageWidths.css, imageWidths.real );
			} );
		}

		this.updateControls();
	};

	/**
	 * Replaces the resized image in the viewer providing we actually got some data.
	 *
	 * @protected
	 *
	 * @param {mw.LightboxInterface} ui lightbox that got resized
	 * @param {mw.mmv.model.Image} imageData information regarding the new resized image
	 * @param {number} targetWidth
	 * @param {number} requestedWidth
	 */
	MMVP.loadResizedImage = function ( ui, imageData, targetWidth, requestedWidth ) {
		// Replace image only if data was returned.
		if ( imageData ) {
			this.loadAndSetImage( ui, imageData, targetWidth, requestedWidth );
		}
	};

	MMVP.updateControls = function () {
		var numImages = this.lightbox.images ? this.lightbox.images.length : 0,
			showNextButton = this.lightbox.currentIndex < (numImages - 1),
			showPreviousButton = this.lightbox.currentIndex > 0;

		this.ui.updateControls( showNextButton, showPreviousButton );
	};

	MMVP.registerLogging = function () {
		var viewer = this;

		this.ui.$closeButton.click( function () {
			if ( viewer.ui.$dialog ) {
				viewer.ui.$dialog.dialog( 'close' );
			}

			mw.mmv.logger.log( 'close-link-click' );
		} );

		this.ui.$fullscreenButton.click( function () {
			if ( viewer.ui.isFullscreen ) {
				mw.mmv.logger.log( 'fullscreen-link-click' );
			} else {
				mw.mmv.logger.log( 'defullscreen-link-click' );
			}
		} );
	};

	/**
	 * @method
	 * Loads and sets the image specified in the imageData. It also updates the controls
	 * and collects profiling information.
	 *
	 * @param {mw.LightboxInterface} ui image container
	 * @param {mw.mmv.model.Image} imageData image information
	 * @param {number} targetWidth
	 * @param {number} requestedWidth
	 */
	MMVP.loadAndSetImage = function ( ui, imageData, targetWidth, requestedWidth ) {
		var maybeThumb,
			viewer = this,
			image = new Image(),
			src;

		// Use cached image if we have it.
		maybeThumb = imageData.getThumbUrl( requestedWidth );

		src = maybeThumb || imageData.url;

		this.performance.record( 'image', src ).then( function() {
			image.src = src;

			if ( maybeThumb && requestedWidth > targetWidth ||
				!maybeThumb && imageData.width > targetWidth ) {
				// Image bigger than the current area, resize before loading
				image.width = targetWidth;
			}

			ui.replaceImageWith( image );
			viewer.updateControls();
		} );
	};

	/**
	 * @method
	 * Loads a specified image.
	 * @param {mw.LightboxImage} image
	 * @param {string} initialSrc The string to set the src attribute to at first.
	 */
	MMVP.loadImage = function ( image, initialSrc ) {
		var imageWidth,
			viewer = this;

		this.lightbox.currentIndex = image.index;

		// Open with the already-loaded thumbnail
		// Avoids trying to load /wiki/Undefined and doesn't
		// cost any network time - the library currently needs
		// some src attribute to work. Will fix.
		image.initialSrc = initialSrc;
		this.currentImageFilename = image.filePageTitle.getPrefixedText();
		this.currentImageFileTitle = image.filePageTitle;
		this.lightbox.iface.comingFromPopstate = comingFromPopstate;

		if ( !this.isOpen ) {
			this.lightbox.open();
			this.isOpen = true;
		} else {
			this.lightbox.iface.empty();
			this.lightbox.iface.load( image );
		}

		$( document.body ).addClass( 'mw-mlb-lightbox-open' );

		imageWidth = this.getImageSizeApiArgs( this.ui );
		this.fetchImageInfoRepoInfoAndFileUsageInfo(
			image.filePageTitle, imageWidth.real
		).then( function ( imageInfo, repoInfoHash, thumbnail, localUsage, globalUsage ) {
			var repoInfo = repoInfoHash[imageInfo.repo];

			viewer.stopListeningToScroll();
			viewer.animateMetadataDivOnce()
				// We need to wait until the animation is finished before we listen to scroll
				.then( function() { viewer.startListeningToScroll(); } );

			viewer.loadAndSetImage( viewer.lightbox.iface, imageInfo, imageWidth.css, imageWidth.real );

			viewer.lightbox.iface.$imageDiv.removeClass( 'empty' );

			if ( imageInfo.lastUploader ) {
				viewer.userInfoProvider.get( imageInfo.lastUploader, repoInfo ).done( function ( gender ) {
					viewer.lightbox.iface.panel.setImageInfo(
						image, imageInfo, repoInfo, localUsage, globalUsage, gender );
				} ).fail( function () {
					viewer.lightbox.iface.panel.setImageInfo(
						image, imageInfo, repoInfo, localUsage, globalUsage, 'unknown' );
				} );
			} else {
				viewer.lightbox.iface.panel.setImageInfo(
					image, imageInfo, repoInfo, localUsage, globalUsage );
			}
		} );

		comingFromPopstate = false;
	};

	/**
	 * @method
	 * Animates the metadata area when the viewer is first opened.
	 * @return {jQuery.Promise} an empty promise which resolves when the animation is finished
	 */
	MMVP.animateMetadataDivOnce = function () {
		if ( !this.hasAnimatedMetadata ) {
			this.hasAnimatedMetadata = true;
			$.scrollTo( 40, 400 )
				.scrollTo( 0, 400 );
		}
		return $.scrollTo.window().promise();
	};

	/**
	 * @method
	 * Stop listening to the page's scroll events
	 */
	MMVP.stopListeningToScroll = function () {
		$.scrollTo().off( 'scroll.mmvp' );
	};

	/**
	 * @method
	 * Start listening to the page's scroll events
	 * Will call MMVP.scroll(), throttled so it is not triggered on every pixel.
	 */
	MMVP.startListeningToScroll = function () {
		var viewer = this;

		$.scrollTo().on( 'scroll.mmvp', $.throttle( 250, function() { viewer.scroll(); } ) );

		// Trigger a check in case the user scrolled manually during the animation
		viewer.scroll();
	};

	/**
	 * @method
	 * Receives the window's scroll events and flips the chevron if necessary.
	 */
	MMVP.scroll = function () {
		this.ui.panel.$dragIcon.toggleClass( 'pointing-down', !!$.scrollTo().scrollTop() );
	};

	/**
	 * @method
	 * Fetches image and thumbnail information from the API.
	 *
	 * @param {mw.Title} fileTitle
	 * @param {number} width width of the thumbnail in pixels
	 * @return {jQuery.Promise<mw.mmv.model.Image, mw.mmv.model.Thumbnail>}
	 */
	MMVP.fetchImageInfoWithThumbnail = function ( fileTitle, width ) {
		return $.when(
			this.imageInfoProvider.get( fileTitle ),
			this.thumbnailInfoProvider.get( fileTitle, width )
		).then( function( imageInfo, thumbnail ) {
			imageInfo.addThumbUrl( thumbnail.width, thumbnail.url );
			return $.Deferred().resolve( imageInfo, thumbnail );
		} );
	};

	/**
	 * Gets all file-related info.
	 * @param {mw.Title} fileTitle Title of the file page for the image.
	 * @param {number} width width of the thumbnail in pixels
	 * @returns {jQuery.Promise.<mw.mmv.model.Image, mw.mmv.model.Repo, mw.mmv.model.Thumbnail,
	 *     mw.mmv.model.FileUsage, mw.mmv.model.FileUsage>}
	 */
	MMVP.fetchImageInfoRepoInfoAndFileUsageInfo = function ( fileTitle, width ) {
		return $.when(
			this.imageInfoProvider.get( fileTitle ),
			this.fileRepoInfoProvider.get( fileTitle ),
			this.thumbnailInfoProvider.get( fileTitle, width ),
			this.imageUsageProvider.get( fileTitle ),
			this.globalUsageProvider.get( fileTitle )
		).then( function( imageInfo, repoInfoHash, thumbnail, imageUsage, globalUsage ) {
			imageInfo.addThumbUrl( thumbnail.width, thumbnail.url );
			return $.Deferred().resolve( imageInfo, repoInfoHash, thumbnail, imageUsage, globalUsage );
		} );
	};

	MMVP.loadIndex = function ( index ) {
		var $clicked = $( imgsSelector ).eq( index );
		if ( index < this.lightbox.images.length && index >= 0 ) {
			this.loadImage( this.lightbox.images[index], $clicked.prop( 'src' ) );
		}
	};

	MMVP.nextImage = function () {
		this.loadIndex( this.lightbox.currentIndex + 1 );
	};

	MMVP.prevImage = function () {
		this.loadIndex( this.lightbox.currentIndex - 1 );
	};

	function handleHash() {
		var statedIndex,
			$foundElement,
			hash = decodeURIComponent( document.location.hash ),
			linkState = hash.split( '/' );

		comingFromPopstate = true;
		if ( linkState[0] === '#mediaviewer' ) {
			statedIndex = mw.mediaViewer.lightbox.images[linkState[2]];

			if ( statedIndex.filePageTitle.getPrefixedText() === linkState[1] ) {
				$foundElement = $( imgsSelector ).eq( linkState[2] );
				mw.mediaViewer.loadImage( statedIndex, $foundElement.prop( 'src' ) );
			}
		} else {
			// If the hash is invalid (not a mmv hash) we check if there's any mmv lightbox open and we close it
			if ( mw.mediaViewer && mw.mediaViewer.lightbox && mw.mediaViewer.lightbox.iface ) {
				mw.mediaViewer.lightbox.iface.unattach();
			}
		}
	}

	$( function () {
		MultiLightbox = window.MultiLightbox;
		lightboxHooks = window.lightboxHooks;

		mw.mediaViewer = new MultimediaViewer();

		handleHash();
		window.addEventListener( 'popstate', handleHash );
	} );

	mw.MultimediaViewer = MultimediaViewer;
}( mediaWiki, jQuery ) );
