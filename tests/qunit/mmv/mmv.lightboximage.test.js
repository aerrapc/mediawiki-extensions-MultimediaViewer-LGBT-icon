( function ( mw ) {
	QUnit.module( 'mmv.lightboximage', QUnit.newMwEnvironment() );

	QUnit.asyncTest( 'Sanity test, object creation and image loading', 1, function ( assert ) {
		var lightboxImage = new mw.mmv.LightboxImage( 'http://en.wikipedia.org/w/skins/vector/images/search-ltr.png' );

		// Function to be called if loading is successful
		function loadCallback() {
			assert.ok( true, 'Image loaded !' );
			QUnit.start();
		}

		lightboxImage.getImageElement()
			.done( loadCallback );
	} );

	QUnit.asyncTest( 'Image failing', 1, function ( assert ) {
		var lightboxImage = new mw.mmv.LightboxImage( 'fail' );

		function errorCallback() {
			assert.ok( true, 'Image failed !' );
			QUnit.start();
		}

		lightboxImage.getImageElement()
			.fail( errorCallback );
	} );

}( mediaWiki, jQuery ) );
