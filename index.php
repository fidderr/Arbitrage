<?php 

function scrape($scrape = ['betcity','unibet','toto','jacks']) {
    $dataString = json_encode($scrape);

    $curl = curl_init();
    curl_setopt($curl, CURLOPT_URL, "http://localhost:3000/scrape");
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_POSTFIELDS, $dataString);
    curl_setopt($curl, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

    $response = curl_exec($curl);

    if (curl_errno($curl)) {
        return curl_error($curl);
    }
    else{
        return $response;
    }
}

$data = scrape();
$table = json_decode($data, true);
?>


<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>arbitrage</title>
</head>
<body>
    
<table>

  <!-- <tr>
    <th>Company</th>
    <th>Contact</th>
    <th>Country</th>
  </tr> -->


  <?php foreach($table AS $bet) { ?>
    <tr>
        <?php foreach($bet['teamOdds'] AS $team) { ?>
            <td><?= $team['team'] ?></td>
            <td><?= $team['bookmaker'] ?></td>
            <td><?= $team['odds'] ?></td>
        <?php } ?>
        <td><?= implode(',  ',$bet['stakesRounded'])?></td>
        <td><?= $bet['stakedSum'] ?></td>
        <td><?= $bet['profit'] ?></td>
    </tr>
  <?php } ?>

</table>

<?php
echo '<pre>';
var_dump($table);
echo '</pre>';
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
