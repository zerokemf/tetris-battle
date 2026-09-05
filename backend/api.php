<?php
// Small shared friends leaderboard. Server-side private storage, no accounts.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: https://zerokemf.github.io');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
function reply($status, $data) { http_response_code($status); echo json_encode($data); exit; }
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') reply(204, null);
if (!in_array($method, ['GET','POST'], true)) reply(405, ['error'=>'Method not allowed']);
$path = getenv('TETRIS_SCORES_FILE') ?: __DIR__ . '/private/scores.json';
$mode = $_GET['mode'] ?? 'solo';
$item = null;
if ($method === 'POST') {
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== 'https://zerokemf.github.io') reply(403, ['error'=>'Origin not allowed']);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2048) reply(413, ['error'=>'Request too large']);
    $raw = file_get_contents('php://input', false, null, 0, 2049);
    if (strlen($raw) > 2048) reply(413, ['error'=>'Request too large']);
    $item = json_decode($raw, true);
    if (!is_array($item)) reply(400, ['error'=>'Invalid JSON']);
    $mode = $item['mode'] ?? '';
    if (!is_string($item['name'] ?? null) || !preg_match('/^[A-Za-z][A-Za-z0-9 _-]{0,15}$/D', $item['name'])) reply(400, ['error'=>'Use an English name, 1–16 characters']);
    if (!is_string($item['id'] ?? null) || !preg_match('/^[a-zA-Z0-9-]{16,64}$/D', $item['id'])) reply(400, ['error'=>'Invalid round ID']);
    foreach (['score'=>1000000000, 'lines'=>1000000] as $key=>$max) if (!is_int($item[$key] ?? null) || $item[$key]<0 || $item[$key]>$max) reply(400, ['error'=>'Invalid score']);
}
if (!in_array($mode, ['solo','battle'], true)) reply(400, ['error'=>'Invalid mode']);
$fp = @fopen($path, 'c+');
if (!$fp || !flock($fp, LOCK_EX)) reply(503, ['error'=>'Score storage temporarily unavailable']);
$raw = stream_get_contents($fp);
$data = $raw === '' ? [] : json_decode($raw, true);
if (!is_array($data)) { flock($fp,LOCK_UN); fclose($fp); reply(503,['error'=>'Score storage needs attention']); }
if ($item !== null) {
    $exists=false;
    foreach ($data as $row) if ($row['id']===$item['id']) { $exists=true; break; }
    if (!$exists) {
        $data[]=['id'=>$item['id'],'name'=>trim($item['name']),'mode'=>$mode,'score'=>$item['score'],'lines'=>$item['lines'],'created_at'=>gmdate('c')];
        // Keep the best 1000 entries per mode; enough for a friends-only board.
        usort($data, function($a,$b){ return ($b['score'] <=> $a['score']) ?: strcmp($a['created_at'],$b['created_at']); });
        $counts=['solo'=>0,'battle'=>0];
        $data=array_values(array_filter($data,function($r) use (&$counts){ return ++$counts[$r['mode']] <= 1000; }));
        $encoded=json_encode($data);
        rewind($fp);
        if (fwrite($fp,$encoded)!==strlen($encoded) || !ftruncate($fp,strlen($encoded)) || !fflush($fp)) { flock($fp,LOCK_UN); fclose($fp); reply(503,['error'=>'Could not save score']); }
    }
}
flock($fp,LOCK_UN); fclose($fp);
$rows=array_values(array_filter($data,function($r) use($mode){return $r['mode']===$mode;}));
usort($rows,function($a,$b){return ($b['score'] <=> $a['score']) ?: strcmp($a['created_at'],$b['created_at']);});
$rank = null;
if ($item !== null) foreach ($rows as $i=>$row) if ($row['id'] === $item['id']) { $rank=$i+1; break; }
$rows=array_slice($rows,0,10);
foreach($rows as &$row) { unset($row['id'],$row['mode']); } unset($row);
reply(200,['ok'=>true,'scores'=>$rows,'rank'=>$rank]);
