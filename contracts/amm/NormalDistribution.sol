// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

/**
 * Normal distribution
 */
contract NormalDistribution {
    mapping(int256 => int256) probabilities;

    constructor() public {
        probabilities[100] = 5040;
        probabilities[200] = 5080;
        probabilities[300] = 5120;
        probabilities[400] = 5160;
        probabilities[500] = 5199;
        probabilities[600] = 5239;
        probabilities[700] = 5279;
        probabilities[800] = 5319;
        probabilities[900] = 5359;
        probabilities[1000] = 5398;
        probabilities[1100] = 5438;
        probabilities[1200] = 5478;
        probabilities[1300] = 5517;
        probabilities[1400] = 5557;
        probabilities[1500] = 5596;
        probabilities[1600] = 5636;
        probabilities[1700] = 5675;
        probabilities[1800] = 5714;
        probabilities[1900] = 5753;
        probabilities[2000] = 5793;
        probabilities[2100] = 5832;
        probabilities[2200] = 5871;
        probabilities[2300] = 5910;
        probabilities[2400] = 5948;
        probabilities[2500] = 5987;
        probabilities[2600] = 6026;
        probabilities[2700] = 6064;
        probabilities[2800] = 6103;
        probabilities[2900] = 6141;
        probabilities[3000] = 6179;
        probabilities[3100] = 6217;
        probabilities[3200] = 6255;
        probabilities[3300] = 6293;
        probabilities[3400] = 6331;
        probabilities[3500] = 6368;
        probabilities[3600] = 6406;
        probabilities[3700] = 6443;
        probabilities[3800] = 6480;
        probabilities[3900] = 6517;
        probabilities[4000] = 6554;
        probabilities[4100] = 6591;
        probabilities[4200] = 6628;
        probabilities[4300] = 6664;
        probabilities[4400] = 6700;
        probabilities[4500] = 6736;
        probabilities[4600] = 6772;
        probabilities[4700] = 6808;
        probabilities[4800] = 6844;
        probabilities[4900] = 6879;
        probabilities[5000] = 6915;
        probabilities[5100] = 6950;
        probabilities[5200] = 6985;
        probabilities[5300] = 7019;
        probabilities[5400] = 7054;
        probabilities[5500] = 7088;
        probabilities[5600] = 7123;
        probabilities[5700] = 7157;
        probabilities[5800] = 7190;
        probabilities[5900] = 7224;
        probabilities[6000] = 7257;
        probabilities[6100] = 7291;
        probabilities[6200] = 7324;
        probabilities[6300] = 7357;
        probabilities[6400] = 7389;
        probabilities[6500] = 7422;
        probabilities[6600] = 7454;
        probabilities[6700] = 7486;
        probabilities[6800] = 7517;
        probabilities[6900] = 7549;
        probabilities[7000] = 7580;
        probabilities[7100] = 7611;
        probabilities[7200] = 7642;
        probabilities[7300] = 7673;
        probabilities[7400] = 7704;
        probabilities[7500] = 7734;
        probabilities[7600] = 7764;
        probabilities[7700] = 7794;
        probabilities[7800] = 7823;
        probabilities[7900] = 7852;
        probabilities[8000] = 7881;
        probabilities[8100] = 7910;
        probabilities[8200] = 7939;
        probabilities[8300] = 7967;
        probabilities[8400] = 7995;
        probabilities[8500] = 8023;
        probabilities[8600] = 8051;
        probabilities[8700] = 8078;
        probabilities[8800] = 8106;
        probabilities[8900] = 8133;
        probabilities[9000] = 8159;
        probabilities[9100] = 8186;
        probabilities[9200] = 8212;
        probabilities[9300] = 8238;
        probabilities[9400] = 8264;
        probabilities[9500] = 8289;
        probabilities[9600] = 8315;
        probabilities[9700] = 8340;
        probabilities[9800] = 8365;
        probabilities[9900] = 8389;
        probabilities[10000] = 8413;
        probabilities[10100] = 8438;
        probabilities[10200] = 8461;
        probabilities[10300] = 8485;
        probabilities[10400] = 8508;
        probabilities[10500] = 8531;
        probabilities[10600] = 8554;
        probabilities[10700] = 8577;
        probabilities[10800] = 8599;
        probabilities[10900] = 8621;
        probabilities[11000] = 8643;
        probabilities[11100] = 8665;
        probabilities[11200] = 8686;
        probabilities[11300] = 8708;
        probabilities[11400] = 8729;
        probabilities[11500] = 8749;
        probabilities[11600] = 8770;
        probabilities[11700] = 8790;
        probabilities[11800] = 8810;
        probabilities[11900] = 8830;
        probabilities[12000] = 8849;
        probabilities[12100] = 8869;
        probabilities[12200] = 8888;
        probabilities[12300] = 8907;
        probabilities[12400] = 8925;
        probabilities[12500] = 8944;
        probabilities[12600] = 8962;
        probabilities[12700] = 8980;
        probabilities[12800] = 8997;
        probabilities[12900] = 9015;
        probabilities[13000] = 9032;
        probabilities[13100] = 9049;
        probabilities[13200] = 9066;
        probabilities[13300] = 9082;
        probabilities[13400] = 9099;
        probabilities[13500] = 9115;
        probabilities[13600] = 9131;
        probabilities[13700] = 9147;
        probabilities[13800] = 9162;
        probabilities[13900] = 9177;
        probabilities[14000] = 9192;
        probabilities[14100] = 9207;
        probabilities[14200] = 9222;
        probabilities[14300] = 9236;
        probabilities[14400] = 9251;
        probabilities[14500] = 9265;
        probabilities[14600] = 9279;
        probabilities[14700] = 9292;
        probabilities[14800] = 9306;
        probabilities[14900] = 9319;
        probabilities[15000] = 9332;
        probabilities[15100] = 9345;
        probabilities[15200] = 9357;
        probabilities[15300] = 9370;
        probabilities[15400] = 9382;
        probabilities[15500] = 9394;
        probabilities[15600] = 9406;
        probabilities[15700] = 9418;
        probabilities[15800] = 9429;
        probabilities[15900] = 9441;
        probabilities[16000] = 9452;
        probabilities[16100] = 9463;
        probabilities[16200] = 9474;
        probabilities[16300] = 9484;
        probabilities[16400] = 9495;
        probabilities[16500] = 9505;
        probabilities[16600] = 9515;
        probabilities[16700] = 9525;
        probabilities[16800] = 9535;
        probabilities[16900] = 9545;
        probabilities[17000] = 9554;
        probabilities[17100] = 9564;
        probabilities[17200] = 9573;
        probabilities[17300] = 9582;
        probabilities[17400] = 9591;
        probabilities[17500] = 9599;
        probabilities[17600] = 9608;
        probabilities[17700] = 9616;
        probabilities[17800] = 9625;
        probabilities[17900] = 9633;
        probabilities[18000] = 9641;
        probabilities[18100] = 9649;
        probabilities[18200] = 9656;
        probabilities[18300] = 9664;
        probabilities[18400] = 9671;
        probabilities[18500] = 9678;
        probabilities[18600] = 9686;
        probabilities[18700] = 9693;
        probabilities[18800] = 9699;
        probabilities[18900] = 9706;
        probabilities[19000] = 9713;
        probabilities[19100] = 9719;
        probabilities[19200] = 9726;
        probabilities[19300] = 9732;
        probabilities[19400] = 9738;
        probabilities[19500] = 9744;
        probabilities[19600] = 9750;
        probabilities[19700] = 9756;
        probabilities[19800] = 9761;
        probabilities[19900] = 9767;
        probabilities[20000] = 9772;
        probabilities[20100] = 9778;
        probabilities[20200] = 9783;
        probabilities[20300] = 9788;
        probabilities[20400] = 9793;
        probabilities[20500] = 9798;
        probabilities[20600] = 9803;
        probabilities[20700] = 9808;
        probabilities[20800] = 9812;
        probabilities[20900] = 9817;
    }

    /**
     * Returns the probability of Z in a normal distribution curve
     * @dev For performance numbers are truncated to 2 decimals. Ex: 1134500000000000000(1.13) gets truncated to 113
     * @dev For Z > ±0.209 the curve response gets more linear
     * @param z A point in the normal distribution
     * @param decimals Amount of decimals of z
     * @return The probability of z
     */
    function getProbability(int256 z, uint256 decimals)
        public
        view
        returns(int256)
    {
        require(decimals >= 2);
        int256 truncateZ = (z / int256(10 ** (decimals - 2))) * 100;
        int256 responseDecimals = int256(10 ** (decimals - 4));

        // Handle negative z
        if (z < 0) {
            return (10000 - probabilities[-truncateZ]) * responseDecimals;
        }

        // As Z approach 0.209 it tends the distributing curve tends to be more linear
        if (truncateZ > 20900) {
            truncateZ = 20900;
        }

        return probabilities[truncateZ] * responseDecimals;
    }
}
