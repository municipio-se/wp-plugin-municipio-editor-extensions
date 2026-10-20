<?php

// Execute with WP-CLI on a staging site only. Authentication output must be
// redirected to a private temporary file, never a build log or Git.
if (wp_get_environment_type() !== 'staging') {
    WP_CLI::error('Fixtures require a staging environment.');
}
$key = 'municipio_editor_extensions_test_fixture';
$fixture = get_option($key);
if (($args[0] ?? '') === 'cleanup') {
    if ($fixture) {
        foreach ($fixture['posts'] as $id) {
            wp_delete_post($id, true);
        }
        require_once ABSPATH . 'wp-admin/includes/user.php';
        if (is_multisite()) {
            require_once ABSPATH . 'wp-admin/includes/ms.php';
            wpmu_delete_user($fixture['user']);
        } else {
            wp_delete_user($fixture['user']);
        }
        delete_option($key);
    }
    WP_CLI::success('Editor fixtures removed.');
    return;
}
if ($fixture) {
    WP_CLI::error('Remove the previous fixture before creating another.');
}
$user = wp_insert_user([
    'user_login' => 'mee_test_' . wp_generate_password(10, false),
    'user_pass' => wp_generate_password(40, true),
    'role' => 'editor',
    'display_name' => 'Editor Extensions test',
]);
if (is_wp_error($user)) {
    WP_CLI::error($user->get_error_message());
}
$fixture = ['user' => $user, 'posts' => []];
update_option($key, $fixture, false);
foreach (['page', 'mod-text', 'mod-manualinput'] as $type) {
    if (!post_type_exists($type)) {
        WP_CLI::error('Missing fixture post type: ' . $type);
    }
    $id = wp_insert_post([
        'post_type' => $type,
        'post_status' => 'draft',
        'post_title' => 'Editor Extensions temporary test',
        'post_content' => '<h3>First heading</h3><p>Paragraph</p><h2>Second heading</h2><h4>Jump</h4>',
        'post_author' => $user,
    ], true);
    if (is_wp_error($id)) {
        WP_CLI::error($id->get_error_message());
    }
    $fixture['posts'][$type] = $id;
    update_option($key, $fixture, false);
    update_post_meta($id, '_wp_page_template', 'default');
    update_post_meta($id, 'modularity-module-hide-title', '0');
    if ($type === 'mod-manualinput') {
        update_field('field_64ff23d0d91bf', 'accordion', $id);
        update_field('field_64ff22b2d91b7', [
            ['title' => 'Test row', 'content' => '<h3>Invalid</h3><h4>Child</h4>'],
        ], $id);
    }
}
$expires = time() + HOUR_IN_SECONDS;
$token = WP_Session_Tokens::get_instance($user)->create($expires);
$domain = wp_parse_url(home_url(), PHP_URL_HOST);
$cookies = [];
foreach ([LOGGED_IN_COOKIE => 'logged_in', SECURE_AUTH_COOKIE => 'secure_auth'] as $name => $scheme) {
    $cookies[] = [
        'name' => $name,
        'value' => wp_generate_auth_cookie($user, $expires, $scheme, $token),
        'domain' => $domain, 'path' => '/', 'httpOnly' => true,
        'secure' => true, 'sameSite' => 'Lax', 'expires' => $expires,
    ];
}
echo wp_json_encode(['origin' => home_url(), 'admin' => admin_url(), 'cookies' => $cookies, 'fixture' => $fixture]);
