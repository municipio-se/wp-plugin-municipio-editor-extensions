<?php

declare(strict_types=1);

namespace MunicipioEditorExtensions;

final class Plugin
{
    private const VERSION = '0.1.2';
    private bool $enqueued = false;

    public function __construct(private readonly string $file) {}

    public function register(): void
    {
        add_action('init', function (): void {
            load_plugin_textdomain('municipio-editor-extensions', false, dirname(plugin_basename($this->file)) . '/languages');
        });
        add_action('wp_enqueue_editor', [$this, 'enqueue']);
        add_filter('mce_external_plugins', [$this, 'plugins']);
        add_filter('tiny_mce_before_init', [$this, 'settings'], 20, 2);
        add_filter('acf/fields/wysiwyg/toolbars', [$this, 'acfAssets']);
    }

    public function acfAssets(array $toolbars): array
    {
        $this->enqueue();
        return $toolbars;
    }

    public function plugins(array $plugins): array
    {
        $this->enqueue();
        $plugins['municipio_editor_extensions'] = add_query_arg('ver', self::VERSION, plugins_url('assets/editor.js', $this->file));
        return $plugins;
    }

    public function enqueue(): void
    {
        if ($this->enqueued) {
            return;
        }
        $this->enqueued = true;
        wp_enqueue_script(
            'municipio-editor-extensions',
            plugins_url('assets/editor.js', $this->file),
            ['wp-tinymce'],
            self::VERSION,
            true,
        );
        wp_enqueue_style(
            'municipio-editor-extensions',
            plugins_url('assets/admin.css', $this->file),
            [],
            self::VERSION,
        );
        wp_add_inline_script(
            'municipio-editor-extensions',
            'window.meeEditorContext = ' . wp_json_encode($this->context()) . ';',
            'before',
        );
    }

    public function settings(array $settings, string $editorId): array
    {
        $settings['mee_context'] = wp_json_encode($this->context());
        return $settings;
    }

    public function context(): array
    {
        require_once __DIR__ . '/HeadingContext.php';
        $context = (new HeadingContext())->resolve(get_post());
        $context['stylesheet'] = add_query_arg('ver', self::VERSION, plugins_url('assets/content.css', $this->file));
        $context['messages'] = [
            'parent' => __('H{level} is outside this field\'s heading hierarchy. Use H{expected} or lower.', 'municipio-editor-extensions'),
            'skip' => __('H{level} skips a heading level. Use H{expected} before going deeper.', 'municipio-editor-extensions'),
        ];
        /**
         * Custom renderers can provide their own field/parent contract. A null
         * level deliberately limits validation to jumps inside the field.
         */
        return apply_filters('Municipio/EditorExtensions/headingContext', $context, get_post());
    }
}
