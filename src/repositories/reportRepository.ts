import { connectDB, connectPatientPortalDB, connectAppointmentDB } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { ObjectId } from 'mongodb';

export interface RawReportData {
  bills: any[];
  orders: any[];
  payments: any[];
  transactions: any[];
}

export class ReportRepository {
  /**
   * Fetches raw billing, ordering, payment, and transaction records from MongoDB
   * for a specific tenant and date range.
   */
  async getRawCreditOutstandingData(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RawReportData> {
    const db = await connectDB();
    
    const billsCol = db.collection('billreports');
    const ordersCol = db.collection('orders');
    const paymentsCol = db.collection('payments');
    const transactionsCol = db.collection('transactions');

    logger.debug(`Repository Query: tenant=${tenantId}, range=${startDate.toISOString()} to ${endDate.toISOString()}`);

    // 1. Fetch UNPAID bills in the date window
    const bills = await billsCol.find({
      tenantKey: tenantId,
      $or: [
        { billedAt: { $gte: startDate, $lte: endDate } },
        { billedAt: { $exists: false }, createdAt: { $gte: startDate, $lte: endDate } }
      ],
      paymentStatus: { $in: ['UNPAID'] }
    }).sort({ billedAt: 1, createdAt: 1 }).toArray();

    logger.debug(`Fetched raw bills: ${bills.length}`);
    if (bills.length === 0) {
      return { bills: [], orders: [], payments: [], transactions: [] };
    }

    // 2. Fetch associated orders
    const orderIds = bills.map((b) => b.orderId).filter(Boolean);
    const orders = await ordersCol.find({
      _id: { $in: orderIds }
    }).toArray();

    // Create a lookup map for orderType === pharmacy check
    const orderMap = new Map(orders.map((o) => [o._id.toString(), o]));
    
    // Filter bills to only include pharmacy orders
    const pharmacyBills = bills.filter((b) => {
      const order = orderMap.get(b.orderId?.toString());
      return order && order.orderType === 'pharmacy';
    });

    logger.debug(`Filtered to pharmacy bills: ${pharmacyBills.length}`);
    if (pharmacyBills.length === 0) {
      return { bills: [], orders: [], payments: [], transactions: [] };
    }

    // 3. Fetch payments linked by ID, billId, orderId or sessionId
    const paymentIds = pharmacyBills.map((b) => b.paymentId).filter(Boolean);
    const billIds = pharmacyBills.map((b) => b._id);
    const orderIdsFiltered = pharmacyBills.map((b) => b.orderId).filter(Boolean);
    const sessionIds = pharmacyBills.map((b) => b.sessionId).filter(Boolean);

    const payments = await paymentsCol.find({
      $or: [
        { _id: { $in: paymentIds } },
        { billId: { $in: billIds } },
        { orderId: { $in: orderIdsFiltered } },
        { sessionId: { $in: sessionIds } }
      ]
    }).toArray();

    // 4. Fetch transactions linked from payments
    const transactionIds = payments.flatMap((p) => p.transactions || []).filter(Boolean);
    const transactions = transactionIds.length > 0 
      ? await transactionsCol.find({ _id: { $in: transactionIds } }).toArray()
      : [];

    logger.debug(`Fetched linked payments: ${payments.length}, transactions: ${transactions.length}`);

    return {
      bills: pharmacyBills,
      orders,
      payments,
      transactions
    };
  }

  /**
   * Fetches raw patient list, room masters, admissions and discharges for Day Duty report.
   */
  async getRawDayDutyData(
    tenantId: string,
    todayStart: Date,
    todayEnd: Date
  ) {
    const db = await connectPatientPortalDB();
    logger.debug(`Repository Query Day Duty: tenant=${tenantId}, range=${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

    const patients = await db.collection('patients').find({
      tenantKey: tenantId,
      status: 204
    }).sort({ dateOfAdmission: 1 }).toArray();

    // Map room references
    const roomIds = patients.map((p) => p.room).filter(Boolean);
    const objectRoomIds = roomIds.map((id) => {
      try {
        return typeof id === 'string' ? new ObjectId(id) : id;
      } catch (e) {
        return null;
      }
    }).filter(Boolean) as ObjectId[];

    const rooms = objectRoomIds.length > 0
      ? await db.collection('roomMaster').find({ _id: { $in: objectRoomIds } }).toArray()
      : [];

    const admissionCount = await db.collection('patients').countDocuments({
      tenantKey: tenantId,
      dateOfAdmission: { $gte: todayStart, $lte: todayEnd }
    });

    const dischargeCount = await db.collection('patients').countDocuments({
      tenantKey: tenantId,
      dateOfDischarge: { $gte: todayStart, $lte: todayEnd }
    });

    return {
      patients,
      rooms,
      admissionCount,
      dischargeCount
    };
  }

  /**
   * Fetches OP appointments count grouped by doctor's specialisation/department.
   */
  async getRawOpCensusData(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ) {
    const db = await connectAppointmentDB();
    logger.debug(`Repository Query OP Census: tenant=${tenantId}, range=${startDate.toISOString()} to ${endDate.toISOString()}`);

    const col = db.collection('patient_appointment');

    const pipeline = [
      {
        $match: {
          tenant_key: tenantId,
          visitType: 'OP',
          appointment_date: { $gte: startDate, $lte: endDate },
          specialisation: { $ne: 'DIALYSIS' }
        }
      },
      {
        $group: {
          _id: '$specialisation',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];

    return col.aggregate(pipeline).toArray();
  }

  /**
   * Fetches IP patient admission counts grouped by doctor's specialisation/department.
   * Categorizes admissions into New Patients (first time in the hospital) and Established Patients.
   */
  async getRawIpCensusData(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ) {
    const db = await connectPatientPortalDB();
    logger.debug(`Repository Query IP Census: tenant=${tenantId}, range=${startDate.toISOString()} to ${endDate.toISOString()}`);

    const col = db.collection('patients');

    const pipeline = [
      {
        $match: {
          tenantKey: tenantId,
          dateOfAdmission: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: "patients",
          let: {
            patient_id: "$patientId",
            admission_date: "$dateOfAdmission",
            tenant: "$tenantKey"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$patientId", "$$patient_id"] },
                    { $eq: ["$tenantKey", "$$tenant"] },
                    { $lt: ["$dateOfAdmission", "$$admission_date"] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: "previous_admissions"
        }
      },
      {
        $addFields: {
          is_new: { $eq: [{ $size: "$previous_admissions" }, 0] }
        }
      },
      {
        $group: {
          _id: "$specialization",
          new_count: { $sum: { $cond: ["$is_new", 1, 0] } },
          established_count: { $sum: { $cond: ["$is_new", 0, 1] } },
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ];

    return col.aggregate(pipeline).toArray();
  }
}
export const reportRepository = new ReportRepository();
