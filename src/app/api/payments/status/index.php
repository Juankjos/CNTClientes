<?php
declare(strict_types=1);

$concepto = 'Pago de mensualidad';
$cantidad = 499.00;

$openpayConfig = [
    'merchant_id' => 'mo9xbus6lvluovm23bna',
    'secret_key' => 'sk_342f349e27c84de4ab391c54311b5c4f',
    'base_url' => 'https://sand-api.ecommercebbva.com/v1',
    'affiliation_bbva' => '508940',
    'customer' => [
        'name' => 'Pago',
        'last_name' => 'Sandbox',
        'email' => 'sandbox.pagos@tvctepa.com',
        'phone_number' => '3331112233',
    ],
];

$apiError = null;
$transactionResponse = null;
$transactionId = trim((string) ($_GET['id'] ?? ''));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $chargeData = [
        'affiliation_bbva' => $openpayConfig['affiliation_bbva'],
        'amount' => round($cantidad, 2),
        'description' => $concepto,
        'currency' => 'MXN',
        'order_id' => 'pagos-' . date('YmdHis') . '-' . substr(bin2hex(random_bytes(4)), 0, 8),
        'redirect_url' => openpay_build_return_url(),
        'customer' => $openpayConfig['customer'],
        'use_3d_secure' => true,
    ];

    $transactionResponse = openpay_create_charge($chargeData, $openpayConfig);
    $paymentUrl = openpay_get_payment_url($transactionResponse);

    if ($paymentUrl !== '') {
        header('Location: ' . $paymentUrl);
        exit;
    }

    $apiError = openpay_extract_error_message($transactionResponse, 'No fue posible crear el cargo en Openpay.');
} elseif ($transactionId !== '') {
    $transactionResponse = openpay_get_transaction_status($transactionId, $openpayConfig);
    if (isset($transactionResponse['error_code']) || isset($transactionResponse['http_code'])) {
        $apiError = openpay_extract_error_message($transactionResponse, 'No fue posible consultar el estatus del pago.');
    }
}

function openpay_create_charge(array $data, array $config): array
{
    $merchantId = $config['merchant_id'];
    $secretKey = $config['secret_key'];
    $url = rtrim($config['base_url'], '/') . '/' . $merchantId . '/charges';

    return openpay_request('POST', $url, $secretKey, $data);
}

function openpay_get_transaction_status(string $transactionId, array $config): array
{
    $merchantId = $config['merchant_id'];
    $secretKey = $config['secret_key'];
    $url = rtrim($config['base_url'], '/') . '/' . $merchantId . '/charges/' . rawurlencode($transactionId);

    return openpay_request('GET', $url, $secretKey);
}

function openpay_request(string $method, string $url, string $secretKey, ?array $data = null): array
{
    $headers = [
        'Content-Type: application/json',
        'Authorization: Basic ' . base64_encode($secretKey . ':'),
    ];

    $clientIp = openpay_get_client_ip();
    if ($clientIp !== '') {
        $headers[] = 'X-Forwarded-For: ' . $clientIp;
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 20);

    if ($data !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return [
            'http_code' => $httpCode,
            'error_code' => 'curl_error',
            'description' => $curlError !== '' ? $curlError : 'No fue posible conectar con Openpay.',
        ];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return [
            'http_code' => $httpCode,
            'error_code' => 'invalid_json',
            'description' => 'Openpay devolvio una respuesta no valida.',
            'raw_response' => $response,
        ];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        $decoded['http_code'] = $httpCode;
    }

    return $decoded;
}

function openpay_get_payment_url(array $response): string
{
    $candidates = [
        $response['payment_method']['url'] ?? null,
        $response['transaction']['url'] ?? null,
        $response['url'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        $value = trim((string) $candidate);
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function openpay_extract_error_message(array $response, string $fallback): string
{
    $parts = [];

    foreach (['description', 'message', 'category', 'error_code', 'http_code'] as $key) {
        if (!isset($response[$key])) {
            continue;
        }

        $value = trim((string) $response[$key]);
        if ($value !== '') {
            $parts[] = $value;
        }
    }

    return $parts !== [] ? implode(' | ', array_unique($parts)) : $fallback;
}

function openpay_build_return_url(): string
{
    $scheme = 'http';
    if (
        (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443'
    ) {
        $scheme = 'https';
    }

    $host = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $path = trim((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));

    if ($host === '') {
        return '';
    }

    return $scheme . '://' . $host . ($path !== '' ? $path : '/');
}

function openpay_get_client_ip(): string
{
    $candidates = [
        (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''),
        (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    ];

    foreach ($candidates as $candidate) {
        if ($candidate === '') {
            continue;
        }

        $parts = explode(',', $candidate);
        foreach ($parts as $part) {
            $ip = trim($part);
            if (filter_var($ip, FILTER_VALIDATE_IP) !== false) {
                return $ip;
            }
        }
    }

    return '';
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function openpay_status_label(?string $status): string
{
    $status = strtolower(trim((string) $status));

    if ($status === 'completed' || $status === 'charged' || $status === 'completed_payment') {
        return 'success';
    }

    if ($status === 'failed' || $status === 'cancelled' || $status === 'declined') {
        return 'error';
    }

    return 'neutral';
}

$statusText = trim((string) ($transactionResponse['status'] ?? ''));
$statusClass = openpay_status_label($statusText);
$prettyResponse = $transactionResponse !== null
    ? json_encode($transactionResponse, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    : '';
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pagos</title>
    <style>
        :root {
            --bg: #f5efe6;
            --card: #fffaf4;
            --line: #dbcdbd;
            --text: #2f2419;
            --muted: #715f4f;
            --accent: #a65725;
            --accent-dark: #87441c;
            --accent-soft: #f4dec8;
            --success-bg: #e8f6ed;
            --success-text: #1c6a3a;
            --error-bg: #fbe5e2;
            --error-text: #8b2f24;
            --neutral-bg: #f3eadf;
            --neutral-text: #7a5a3b;
            --shadow: 0 18px 36px rgba(73, 43, 19, 0.14);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background:
                radial-gradient(circle at top left, rgba(166, 87, 37, 0.16), transparent 28%),
                linear-gradient(180deg, #f8f3ec 0%, var(--bg) 100%);
            color: var(--text);
            font-family: "Trebuchet MS", Verdana, sans-serif;
        }

        .payment-card {
            width: min(100%, 720px);
            background: var(--card);
            border: 1px solid rgba(123, 88, 59, 0.18);
            border-radius: 24px;
            box-shadow: var(--shadow);
            padding: 28px;
        }

        .eyebrow {
            display: inline-block;
            margin-bottom: 12px;
            padding: 6px 12px;
            border-radius: 999px;
            background: #f3e2cf;
            color: var(--accent-dark);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        h1 {
            margin: 0 0 10px;
            font-size: 32px;
        }

        .note {
            margin: 0 0 22px;
            color: var(--muted);
            line-height: 1.55;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
            margin-bottom: 24px;
        }

        .summary-item,
        .result-card,
        .debug-card {
            padding: 16px 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: #fff;
        }

        .summary-label,
        .result-label {
            display: block;
            margin-bottom: 8px;
            color: var(--muted);
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        .summary-value {
            font-size: 22px;
            font-weight: 700;
        }

        .pay-form {
            margin: 0 0 18px;
        }

        .pay-button,
        .secondary-button {
            width: 100%;
            border: 0;
            border-radius: 16px;
            padding: 16px 18px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.16s ease, background 0.16s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .pay-button {
            background: var(--accent);
            color: #fff8f1;
        }

        .pay-button:hover,
        .secondary-button:hover {
            transform: translateY(-1px);
        }

        .pay-button:hover {
            background: var(--accent-dark);
        }

        .secondary-button {
            margin-top: 10px;
            background: transparent;
            border: 1px solid rgba(127, 63, 24, 0.24);
            color: var(--accent-dark);
        }

        .alert {
            margin: 0 0 18px;
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid rgba(139, 47, 36, 0.15);
            background: var(--error-bg);
            color: var(--error-text);
            line-height: 1.5;
        }

        .result-card {
            margin-bottom: 16px;
        }

        .result-card.success {
            background: var(--success-bg);
            color: var(--success-text);
            border-color: rgba(28, 106, 58, 0.14);
        }

        .result-card.error {
            background: var(--error-bg);
            color: var(--error-text);
            border-color: rgba(139, 47, 36, 0.14);
        }

        .result-card.neutral {
            background: var(--neutral-bg);
            color: var(--neutral-text);
            border-color: rgba(122, 90, 59, 0.14);
        }

        .result-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin-top: 14px;
        }

        .result-value {
            font-size: 18px;
            font-weight: 700;
        }

        pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 13px;
            line-height: 1.5;
            color: var(--text);
        }
    </style>
</head>
<body>
    <main class="payment-card">
        <span class="eyebrow">Pagos / Sandbox</span>
        <h1>Cobro rapido</h1>
        <p class="note">Esta pantalla crea un cargo en Openpay BBVA sandbox, redirige al formulario del banco y, cuando Openpay regresa con el identificador de la transaccion, consulta el estatus del pago en esta misma pagina.</p>

        <section class="summary">
            <article class="summary-item">
                <span class="summary-label">Concepto</span>
                <div class="summary-value"><?= h($concepto) ?></div>
            </article>

            <article class="summary-item">
                <span class="summary-label">Cantidad</span>
                <div class="summary-value">$<?= number_format($cantidad, 2) ?></div>
            </article>
        </section>

        <?php if ($apiError !== null): ?>
            <div class="alert"><?= h($apiError) ?></div>
        <?php endif; ?>

        <?php if ($transactionResponse !== null): ?>
            <section class="result-card <?= h($statusClass) ?>">
                <span class="result-label">Resultado de la transaccion</span>
                <div class="result-value"><?= h($statusText !== '' ? strtoupper($statusText) : 'SIN ESTATUS') ?></div>

                <div class="result-grid">
                    <div>
                        <span class="result-label">Transaccion</span>
                        <div><?= h((string) ($transactionResponse['id'] ?? $transactionId)) ?></div>
                    </div>
                    <div>
                        <span class="result-label">Orden</span>
                        <div><?= h((string) ($transactionResponse['order_id'] ?? '-')) ?></div>
                    </div>
                    <div>
                        <span class="result-label">Autorizacion</span>
                        <div><?= h((string) ($transactionResponse['authorization'] ?? '-')) ?></div>
                    </div>
                    <div>
                        <span class="result-label">Monto</span>
                        <div><?= h(isset($transactionResponse['amount']) ? '$' . number_format((float) $transactionResponse['amount'], 2) : '-') ?></div>
                    </div>
                </div>
            </section>

            <?php if ($prettyResponse !== false && $prettyResponse !== ''): ?>
                <section class="debug-card">
                    <span class="result-label">Respuesta completa</span>
                    <pre><?= h($prettyResponse) ?></pre>
                </section>
            <?php endif; ?>
        <?php endif; ?>

        <form method="post" class="pay-form">
            <button type="submit" class="pay-button">Pagar</button>
        </form>

        <a class="secondary-button" href="<?= h(openpay_build_return_url()) ?>">Reiniciar</a>
    </main>
</body>
</html>