<?php 
// ['betcity','unibet','toto','jacks']
function scrape($scrape = ['betcity','unibet','toto','jacks','livescorebet']) {
    $dataString = json_encode($scrape);

    $curl = curl_init();
    curl_setopt($curl, CURLOPT_URL, "http://localhost:3000/scrape");
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_POSTFIELDS, $dataString);
    curl_setopt($curl, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

    $response = curl_exec($curl);

    if (curl_errno($curl)) {
        var_dump('Run `node server.js` to start the server <br>');
        return curl_error($curl);
    }
    else{
        return json_decode($response, true);
    }
}

$data = scrape(['betcity','unibet','toto','jacks','livescorebet']);
?>


<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arbitrage</title>
</head>
<body>
    
<table>
  <tr>
    <th>Bookmaker</th>
    <th>Team</th>
    <th>Odds</th>
    <th>Stake</th>
  </tr>

  <?php foreach($data AS $match) { ?>
    <?php foreach($match['highestOdds'] AS $bet) { ?>
        <tr>
          <td><?= $bet['bookmaker'] ?></td>
          <td><?= $bet['team'] ?></td>
          <td><?= $bet['odds'] ?></td>
          <td><?= $bet['stake'] ?></td>
        </tr>
      <?php } ?>
      <tr>
          <td><b>StartTime: <b><?= $match['startTime'] ?></b></td>
          <td><b>Staked: <b><?= $match['staked'] ?></b></td>
          <td><b>Profit: <?= $match['profit'] ?></b></td>
          <td><b></b></td>
      </tr>
      <tr>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
  <?php } ?>
</table>

<?php
echo '<pre>';
var_dump($data);
echo '<pre>';
?>

</body>

<style>
table {
  font-family: arial, sans-serif;
  border-collapse: collapse;
  width: 100%;
}

td, th {
  border: 1px solid #dddddd;
  text-align: left;
  padding: 8px;
}

tr:nth-child(even) {
  background-color: #dddddd;
}
</style>

</html>
