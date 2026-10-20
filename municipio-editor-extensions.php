<?php

declare(strict_types=1);

/**
 * Plugin Name: Municipio Editor Extensions
 * Description: Advisory heading guidance in TinyMCE editors.
 * Version: 0.1.4
 * Author: Whitespace
 * Requires PHP: 8.2
 * License: MIT
 * Text Domain: municipio-editor-extensions
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/source/Plugin.php';
(new MunicipioEditorExtensions\Plugin(__FILE__))->register();
