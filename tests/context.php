<?php

require __DIR__ . '/../source/HeadingContext.php';

use MunicipioEditorExtensions\HeadingContext;

function expectLevel(string $source, ?int $expected): void
{
    $path = tempnam(sys_get_temp_dir(), 'mee-template-');
    file_put_contents($path, $source);
    $actual = HeadingContext::templateLevel($path);
    unlink($path);
    if ($actual !== $expected) {
        throw new RuntimeException("Expected " . var_export($expected, true) . ", got " . var_export($actual, true));
    }
}

expectLevel("@typography(['element' => 'h3', 'variant' => 'h4'])", 3);
expectLevel("@typography(['element' => 'h2']) @typography(['element' => 'h2'])", 2);
expectLevel("@typography(['element' => 'h2']) @typography(['element' => 'h3'])", null);
expectLevel("@typography(['element' => \$headingLevel])", null);
expectLevel("<h4>Heading</h4>", 4);
expectLevel("<div>No heading</div>", null);
if (HeadingContext::templateLevel('/missing/heading-template') !== null) {
    throw new RuntimeException('Missing templates must remain unknown');
}
echo "Template contracts passed.\n";
