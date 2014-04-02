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
	function makeDownload() {
		return new mw.mmv.ui.reuse.Download( $( '#qunit-fixture' ) );
	}

	QUnit.module( 'mmv.ui.reuse.download', QUnit.newMwEnvironment() );

	QUnit.test( 'Sanity test, object creation and UI construction', 6, function ( assert ) {
		var download = makeDownload();

		assert.ok( download, 'download UI element is created.' );
		assert.strictEqual( download.$pane.length, 1, 'Pane div created.' );
		assert.ok( download.$downloadButton && download.$selectionArrow, 'Download button created.' );
		assert.ok( download.downloadSizeMenu, 'Image size pulldown menu created.' );
		assert.ok( download.$previewLink, 'Preview link created.' );
		assert.ok( download.defaultItem, 'Default item set.' );
	} );

	QUnit.test( 'set()/empty():', 5, function ( assert ) {
		var download = makeDownload(),
			src = 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Foobar.jpg',
			image = { // fake mw.mmv.model.Image
				title: new mw.Title( 'File:Foobar.jpg' ),
				url: src,
			};

		assert.strictEqual( download.imageExtension, undefined, 'Image extension is not set.' );

		download.utils.updateMenuOptions = function() {
			assert.ok( true, 'Menu options updated.' );
		};
		download.downloadSizeMenu.getMenu().selectItem = function() {
			assert.ok( true, 'Default item selected to update the labels.' );
		};

		download.set( image );

		assert.strictEqual( download.imageExtension, 'jpg', 'Image extension is set correctly.' );

		download.empty();

		assert.strictEqual( download.imageExtension, undefined, 'Image extension is not set.' );
	} );

	QUnit.test( 'attach()/unattach():', 2, function ( assert ) {
		var download = makeDownload(),
			image = {
				title: new mw.Title( 'File:Foobar.jpg' ),
				url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Foobar.jpg',
			};

		download.set( image );

		download.handleSizeSwitch = function() {
			assert.ok( false, 'handleSizeSwitch should not have been called.' );
		};
		download.downloadSizeMenu.$element.click = function() {
			assert.ok( false, 'Menu selection should not have happened.' );
		};

		// Triggering action events before attaching should do nothing
		download.downloadSizeMenu.getMenu().emit(
			'select', download.downloadSizeMenu.getMenu().getSelectedItem() );
		download.$selectionArrow.click();

		download.handleSizeSwitch = function() {
			assert.ok( true, 'handleSizeSwitch was called.' );
		};
		download.downloadSizeMenu.$element.click = function() {
			assert.ok( true, 'Menu selection happened.' );
		};

		download.attach();

		// Action events should be handled now
		download.downloadSizeMenu.getMenu().emit(
			'select', download.downloadSizeMenu.getMenu().getSelectedItem() );
		download.$selectionArrow.click();

		// Test the unattach part
		download.handleSizeSwitch = function() {
			assert.ok( false, 'handleSizeSwitch should not have been called.' );
		};
		download.downloadSizeMenu.$element.click = function() {
			assert.ok( false, 'Menu selection should not have happened.' );
		};

		download.unattach();

		// Triggering action events now that we are unattached should do nothing
		download.downloadSizeMenu.getMenu().emit(
			'select', download.downloadSizeMenu.getMenu().getSelectedItem() );
		download.$selectionArrow.click();
	} );

	QUnit.test( 'handleSizeSwitch():', 6, function ( assert ) {
		var download = makeDownload(),
			newImageUrl = 'https://upload.wikimedia.org/wikipedia/commons/3/3a/NewFoobar.jpg';

		assert.strictEqual( download.$downloadButton.html(), '', 'Button has empty content.' );
		assert.strictEqual( download.$downloadButton.attr( 'href' ), undefined, 'Button href is empty.' );
		assert.strictEqual( download.$previewLink.attr( 'href' ), undefined, 'Preview link href is empty.' );

		download.utils.getThumbnailUrlPromise = function() {
			return $.Deferred().resolve( { url: newImageUrl } ).promise();
		};

		download.handleSizeSwitch( download.downloadSizeMenu.getMenu().getSelectedItem() );

		assert.ok( download.$downloadButton.html().match( /original.*/ ), 'Button message updated.' );
		assert.strictEqual( download.$downloadButton.attr( 'href' ), newImageUrl + '?download', 'Button href updated.' );
		assert.strictEqual( download.$previewLink.attr( 'href' ), newImageUrl, 'Preview link href updated.' );
	} );

}( mediaWiki, jQuery ) );
