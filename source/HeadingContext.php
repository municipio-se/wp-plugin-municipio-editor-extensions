<?php

declare(strict_types=1);

namespace MunicipioEditorExtensions;

final class HeadingContext
{
    /**
     * Read only a literal, unambiguous heading contract from the installed
     * partial. Dynamic elements or missing templates are unknown, not guesses.
     * This lets a template fix change the editor rule in the same deployment.
     */
    public static function templateLevel(string $path): ?int
    {
        if (!is_readable($path)) {
            return null;
        }
        $source = file_get_contents($path);
        if ($source === false || preg_match('/[\'"]element[\'"]\s*=>\s*[^\'"\s]/', $source)) {
            return null;
        }
        preg_match_all('/[\'"]element[\'"]\s*=>\s*[\'"]h([1-6])[\'"]|<h([1-6])(?:\s|>)/i', $source, $matches, PREG_SET_ORDER);
        $levels = array_unique(array_map(static fn(array $match): int => (int) ($match[1] ?: $match[2]), $matches));
        return count($levels) === 1 ? array_values($levels)[0] : null;
    }

    public function resolve(?object $post): array
    {
        $theme = get_template_directory();
        $module = defined('MODULARITY_MODULE_PATH') ? MODULARITY_MODULE_PATH : '';
        $components = defined('COMPONENTLIBRARY_PATH') ? COMPONENTLIBRARY_PATH . 'source/php/Component/' : '';
        $parent = null;
        $pageLevels = [];
        $template = '';
        $alwaysTitle = false;
        $showTitle = false;
        if ($post && in_array($post->post_type, ['post', 'page'], true)) {
            $template = get_page_template_slug($post->ID);
            $pageLevels = [
                'default' => self::templateLevel($theme . '/views/v3/partials/article.blade.php'),
                'one-page.blade.php' => self::templateLevel($theme . '/views/v3/one-page.blade.php'),
            ];
            // Use the renderer's filter so Theme Extensions' promoted titles
            // and its front-page exception keep the same meaning in the editor.
            $alwaysTitle = (bool) apply_filters('Municipio/Controller/Singular/showTitleOnOnePage', false, $post->ID);
            $showTitle = function_exists('get_field') && (bool) get_field('post_one_page_show_title', $post->ID);
            $parent = $pageLevels[$template ?: 'default'] ?? null;
        }
        return [
            'postType' => $post->post_type ?? '',
            'parentLevel' => $parent,
            'pageLevels' => $pageLevels,
            'template' => $template ?: 'default',
            'onePageAlwaysTitle' => $alwaysTitle,
            'onePageShowTitle' => $showTitle,
            'textLevel' => $module ? self::templateLevel($module . 'Text/views/partials/postTitle.blade.php') : null,
            'fields' => [
                // Other ACF fields, including Contacts, Section Full and Classic
                // editor blocks, have no unambiguous enclosing heading contract.
                'field_64ff231ed91b9' => [
                    'level' => $components ? self::templateLevel($components . 'Accordion__item/partials/heading.blade.php') : null,
                    'when' => ['key' => 'field_64ff23d0d91bf', 'value' => 'accordion'],
                ],
            ],
        ];
    }
}
